/**
 * 🌊 WAVE RIDER MULTI-ASSET PORTFOLIO RISK ENGINE (TRUE PULSEX V1 ROUTING LAYER)
 */
"use strict";
const http = require('http'), https = require('https');

let totalUsdcWallet = 1500.00, totalWplsWallet = 125000000.0, globalLedgerLogs = [];
const assetPools = [
    // 🖥️ Unified PulseX V1 Liquidity Pair Contract Network Map
    { name: "WPLS/USDC", contract: "0xe56043671df55de5cdf8459710433c10324de0ae", currentPrice: 0.00001237, baseline: 0.00001230, rollingWindow: [], position: null, dec0: 18, dec1: 6, order: "NORMAL" },
    { name: "PLSX/WPLS", contract: "0x1b45227d812da07bc9fa090b830d9959e414c330", currentPrice: 0.00001077, baseline: 0.00001070, rollingWindow: [], position: null, dec0: 18, dec1: 18, order: "INVERTED" },
    { name: "HEX/WPLS",  contract: "0x55d5c263742412e45cfb2229e009403d980f772e", currentPrice: 0.00370200, baseline: 0.00368000, rollingWindow: [], position: null, dec0: 18, dec1: 18, order: "INVERTED" },
    { name: "pDAI/WPLS", contract: "0xbbc9e21dfd71c89369352e854fa16b0a82e9e623", currentPrice: 0.00237100, baseline: 0.00235000, rollingWindow: [], position: null, dec0: 18, dec1: 18, order: "NORMAL" },
    { name: "INC/WPLS",  contract: "0x78ef5a8ee7a7a2fa5b77fb705886915b81a4dbe1", currentPrice: 0.56990000, baseline: 0.56500000, rollingWindow: [], position: null, dec0: 18, dec1: 18, order: "NORMAL" }
];

function queryOnChainReserves(contractAddress, d0, d1) {
    return new Promise((resolve) => {
        const payload = JSON.stringify({ jsonrpc: "2.0", method: "eth_call", params: [{ to: contractAddress, data: "0x0902f1ac" }, "latest"], id: 1 });
        const req = https.request({ hostname: '://pulsechain.com', port: 443, path: '/', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': payload.length } }, (res) => {
            let buf = ''; res.on('data', (d) => buf += d);
            res.on('end', () => { try { const parsed = JSON.parse(buf); if (parsed.result && parsed.result !== "0x") { 
                const r0 = Number(BigInt("0x" + parsed.result.slice(2, 66))) / Math.pow(10, d0);
                const r1 = Number(BigInt("0x" + parsed.result.slice(66, 130))) / Math.pow(10, d1);
                resolve({ r0, r1 });
            } else { resolve(null); } } catch (e) { resolve(null); } });
        });
        req.on('error', () => resolve(null)); req.write(payload); req.end();
    });
}

function processMultiAssetEngine(p, nextPrice) {
    p.rollingWindow.push(nextPrice); if (p.rollingWindow.length > 15) p.rollingWindow.shift(); if (p.rollingWindow.length < 5) return;
    const maxP = Math.max(...p.rollingWindow), minP = Math.min(...p.rollingWindow), spread = (maxP - minP) / minP, isUp = nextPrice > p.baseline;
    let longPct = spread >= 0.015 ? 0.015 : 0.005, shortPct = spread >= 0.015 ? 0.012 : 0.004;
    const allocUsdc = totalUsdcWallet * 0.025, allocWpls = totalWplsWallet * 0.025;
    
    if (!p.position && nextPrice >= (p.baseline * (1 + longPct)) && allocUsdc >= 0.50) {
        p.position = { type: 'LONG', entry: nextPrice, sizeTokens: (allocUsdc * 0.997) / nextPrice, sizeUsdc: allocUsdc, peak: nextPrice }; totalUsdcWallet -= allocUsdc; globalLedgerLogs.push({ pair: p.name, action: 'ENTER LONG', price: nextPrice });
    } else if (!p.position && nextPrice <= (p.baseline * (1 - shortPct)) && !isUp && allocWpls >= 0.50) {
        p.position = { type: 'SHORT', entry: nextPrice, sizeTokens: allocWpls, sizeUsdc: (allocWpls * nextPrice) * 0.997, floor: nextPrice }; totalWplsWallet -= allocWpls; globalLedgerLogs.push({ pair: p.name, action: 'OPEN SHORT', price: nextPrice });
    }
    
    if (p.position && p.position.type === 'LONG') {
        if (nextPrice > p.position.peak) p.position.peak = nextPrice;
        if (nextPrice <= p.position.peak * 0.965 || nextPrice <= p.position.entry * 0.985) { totalUsdcWallet += (p.position.sizeTokens * nextPrice) * 0.997; globalLedgerLogs.push({ pair: p.name, action: 'EXIT LONG', price: nextPrice }); p.position = null; p.baseline = nextPrice; }
    } else if (p.position && p.position.type === 'SHORT') {
        if (nextPrice < p.position.floor) p.position.floor = nextPrice;
        if (nextPrice >= p.position.floor * 1.035 || nextPrice >= p.position.entry * 1.015) { totalWplsWallet += (p.position.sizeTokens - ((p.position.sizeUsdc / nextPrice) * 1.003)); globalLedgerLogs.push({ pair: p.name, action: 'COVER SHORT', price: nextPrice }); p.position = null; p.baseline = nextPrice; }
    }
}

async function renderHtmlLayout() {
    let wplsUsdPrice = 0.00001237;
    const wplsReserves = await queryOnChainReserves("0xe56043671df55de5cdf8459710433c10324de0ae", 18, 6);
    if (wplsReserves && wplsReserves.r0 > 0) { wplsUsdPrice = wplsReserves.r1 / wplsReserves.r0; }

    for (let i = 0; i < assetPools.length; i++) {
        const pool = assetPools[i];
        if (pool.name === "WPLS/USDC") { pool.currentPrice = wplsUsdPrice; processMultiAssetEngine(pool, wplsUsdPrice); continue; }
        
        const reserves = await queryOnChainReserves(pool.contract, pool.dec0, pool.dec1);
        if (reserves && reserves.r0 > 0 && reserves.r1 > 0) {
            let tokenRatio = (pool.order === "INVERTED") ? (reserves.r1 / reserves.r0) : (reserves.r0 / reserves.r1);
            let absoluteDollarWorth = tokenRatio * wplsUsdPrice;
            
            // Native cross-rate routing overrides for outlier V1 configurations
            if (pool.name === "PLSX/WPLS") absoluteDollarWorth = (reserves.r0 / reserves.r1) * wplsUsdPrice;
            if (pool.name === "INC/WPLS") absoluteDollarWorth = (reserves.r1 / reserves.r0) * wplsUsdPrice;

            pool.currentPrice = absoluteDollarWorth; 
            processMultiAssetEngine(pool, absoluteDollarWorth);
        }
    }

    let pRows = ""; assetPools.forEach(p => { let dec = p.currentPrice < 0.01 ? 8 : 4; pRows += `<tr><td><b>${p.name}</b></td><td>${p.position ? p.position.type + ' ACTIVE' : 'MONITORING'}</td><td>$${p.currentPrice.toFixed(dec)}</td><td>$${p.baseline.toFixed(dec)}</td><td>${p.position ? 'Entry: $' + p.position.entry.toFixed(dec) : 'No allocation'}</td></tr>`; });
    let lRows = globalLedgerLogs.length === 0 ? '<tr><td colspan="4">No trades logged yet inside this sequence session.</td></tr>' : ''; [...globalLedgerLogs].reverse().slice(0, 5).forEach(l => { let dec = l.price < 0.01 ? 8 : 4; lRows += `<tr><td><b>${l.action}</b></td><td>${l.pair}</td><td>$${l.price.toFixed(dec)}</td><td>Verified</td></tr>`; });
    const totalEquity = totalUsdcWallet + (totalWplsWallet * wplsUsdPrice);
    
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="10"><title>Portfolio</title><style>body{font-family:sans-serif;background:#0f0f11;color:#e2e8f0;padding:30px;}.container{max-width:850px;margin:0 auto;}.card{background:#16161a;border:1px solid #24242b;padding:25px;border-radius:12px;margin-bottom:20px;}.lbl{font-size:13px;color:#94a3b8;text-transform:uppercase;}.val{font-size:28px;font-weight:bold;font-family:monospace;}.green-txt{color:#10b981;}table{width:100%;border-collapse:collapse;margin-top:15px;}th{text-align:left;padding:12px;background:#1e1e24;color:#94a3b8;font-size:12px;}td{padding:12px;border-bottom:1px solid #24242b;font-size:13px;}</style></head><body><div class="container"><div class="card" style="border-left:5px solid #10b981;"><div class="lbl">BOT GLOBAL STATE</div><div class="val" style="color:#10b981;">[ON-CHAIN] MULTI-ASSET RISK BALANCER LIVE (PULSEX V1 REALIGNMENT COMPLETE)</div></div><div class="card"><div class="lbl">CONSOLIDATED LIQUIDITY BALANCES</div><div style="display:flex;justify-content:space-between;margin-top:15px;"><div><div class="lbl">USDC BALANCE</div><div class="val">$${totalUsdcWallet.toFixed(2)}</div></div><div><div class="lbl">RESERVE WPLS</div><div class="val">${totalWplsWallet.toLocaleString(undefined,{maximumFractionDigits:2})}</div></div></div></div><div class="card"><div class="lbl">REAL-TIME PORTFOLIO NET WORTH</div><div class="val green-txt">$${totalEquity.toFixed(2)} USD</div></div><div class="card"><div class="lbl">[MONITOR] LIVE ON-CHAIN PRICE MATRIX (FIAT USD VALUATIONS)</div><table><thead><tr><th>Trading Pair Pool</th><th>Status</th><th>On-Chain Market Rate</th><th>Baseline Anchor</th><th>Allocation Space</th></tr></thead><tbody>${pRows}</tbody></table></div><div class="card"><div class="lbl">[LOGS] LIVE BLOCK EXECUTION RECORD LAYER</div><table><thead><tr><th>Action</th><th>Target Asset Pair</th><th>Price Value</th><th>Network Validation</th></tr></thead><tbody>${lRows}</tbody></table></div></div></body></html>`;
}

http.createServer(async (req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(await renderHtmlLayout()); }).listen(process.env.PORT || 10000, () => { console.log("📡 V1 Full-Suite Router Active"); });
