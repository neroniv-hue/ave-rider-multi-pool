/**
 * 🌊 WAVE RIDER MULTI-ASSET PORTFOLIO RISK ENGINE & INTERFACE LAYER
 */
"use strict";
const http = require('http');

let totalUsdcWallet = 1500.00;
let totalWplsWallet = 125000000.0;

const assetPools = [
    { name: "WPLS/USDC", currentPrice: 0.00001187, baseline: 0.00001182, rollingWindow: [], position: null },
    { name: "PLSX/WPLS", currentPrice: 0.00003450, baseline: 0.00003410, rollingWindow: [], position: null },
    { name: "HEX/WPLS",  currentPrice: 0.12500000, baseline: 0.12350000, rollingWindow: [], position: null },
    { name: "DAI/WPLS",  currentPrice: 84200.0000, baseline: 84000.0000, rollingWindow: [], position: null },
    { name: "INC/WPLS",  currentPrice: 145.000000, baseline: 144.100000, rollingWindow: [], position: null }
];

let globalLedgerLogs = [];

function updatePoolVolatility(pool, price) {
    pool.rollingWindow.push(price);
    if (pool.rollingWindow.length > 15) pool.rollingWindow.shift();
    if (pool.rollingWindow.length < 5) return { longPct: 0.005, shortPct: 0.004, isTrendingUp: false };
    const maxP = Math.max(...pool.rollingWindow), minP = Math.min(...pool.rollingWindow);
    const spread = (maxP - minP) / minP, isTrendingUp = price > pool.baseline;
    if (spread >= 0.015) return { longPct: 0.015, shortPct: 0.012, isTrendingUp }; 
    else if (spread <= 0.002) return { longPct: 0.0025, shortPct: 0.002, isTrendingUp }; 
    else return { longPct: 0.005, shortPct: 0.004, isTrendingUp };
}

function processMultiAssetEngine(pool, nextPrice) {
    const { longPct, shortPct, isTrendingUp } = updatePoolVolatility(pool, nextPrice);
    const allocUsdc = totalUsdcWallet * 0.025, allocWpls = totalWplsWallet * 0.025;
    if (!pool.position && nextPrice >= (pool.baseline * (1 + longPct)) && allocUsdc >= 0.50) {
        pool.position = { type: 'LONG', entry: nextPrice, sizeTokens: (allocUsdc * 0.997) / nextPrice, sizeUsdc: allocUsdc, peak: nextPrice };
        totalUsdcWallet -= allocUsdc;
        globalLedgerLogs.push({ pair: pool.name, action: 'ENTER LONG', price: nextPrice });
    } else if (!pool.position && nextPrice <= (pool.baseline * (1 - shortPct)) && !isTrendingUp && allocWpls >= 0.50) {
        pool.position = { type: 'SHORT', entry: nextPrice, sizeTokens: allocWpls, sizeUsdc: (allocWpls * nextPrice) * 0.997, floor: nextPrice };
        totalWplsWallet -= allocWpls;
        globalLedgerLogs.push({ pair: pool.name, action: 'OPEN SHORT', price: nextPrice });
    }
    if (pool.position && pool.position.type === 'LONG') {
        if (nextPrice > pool.position.peak) pool.position.peak = nextPrice;
        if (nextPrice <= pool.position.peak * 0.965 || nextPrice <= pool.position.entry * 0.985) {
            totalUsdcWallet += (pool.position.sizeTokens * nextPrice) * 0.997;
            globalLedgerLogs.push({ pair: pool.name, action: 'EXIT LONG', price: nextPrice });
            pool.position = null; pool.baseline = nextPrice;
        }
    } else if (pool.position && pool.position.type === 'SHORT') {
        if (nextPrice < pool.position.floor) pool.position.floor = nextPrice;
        if (nextPrice >= pool.position.floor * 1.035 || nextPrice >= pool.position.entry * 1.015) {
            totalWplsWallet += (pool.position.sizeTokens - ((pool.position.sizeUsdc / nextPrice) * 1.003));
            globalLedgerLogs.push({ pair: pool.name, action: 'COVER SHORT', price: nextPrice });
            pool.position = null; pool.baseline = nextPrice;
        }
    }
}

function generateHtmlLayout() {
    globalLedgerLogs = [];
    const prices = [0.00001014, 0.00001055, 0.00000995, 0.00001075, 0.00001190, 0.00001262, 0.00001187];
    prices.forEach(p => {
        assetPools.forEach(pool => {
            let adj = p;
            if (pool.name.includes("PLSX")) adj = p * 2.9;
            if (pool.name.includes("HEX")) adj = p * 10500;
            if (pool.name.includes("DAI")) adj = p * 7000000000;
            if (pool.name.includes("INC")) adj = p * 12200000;
            processMultiAssetEngine(pool, adj);
        });
    });
    
    let poolRowsHtml = "";
    assetPools.forEach(p => {
        let label = p.position ? `<span style="background:${p.position.type==='LONG'?'#10b981':'#f43f5e'};color:white;padding:3px 6px;border-radius:4px;font-weight:bold;font-size:11px;">${p.position.type} ACTIVE</span>` : `<span style="background:#475569;color:white;padding:3px 6px;border-radius:4px;font-weight:bold;font-size:11px;">MONITORING</span>`;
        let details = p.position ? `Entry: $${p.position.entry.toFixed(p.position.entry < 1 ? 6 : 2)}` : "No active allocation";
        poolRowsHtml += `<tr><td><b>${p.name}</b></td><td>${label}</td><td>$${p.currentPrice.toFixed(p.currentPrice < 1 ? 6 : 2)}</td><td>$${p.baseline.toFixed(p.baseline < 1 ? 6 : 2)}</td><td><span style="color:#94a3b8;">${details}</span></td></tr>`;
    });

    let ledgerRowsHtml = globalLedgerLogs.length === 0 ? '<tr><td colspan="4" style="text-align:center;color:#64748b;padding:12px;">No logged trades.</td></tr>' : '';
    [...globalLedgerLogs].reverse().slice(0, 5).forEach(log => {
        let col = log.action.includes('ENTER') || log.action.includes('COVER') ? '#10b981' : '#ef4444';
        ledgerRowsHtml += `<tr><td><span style="background:${col};color:white;padding:2px 5px;border-radius:4px;font-size:11px;font-weight:bold;">${log.action}</span></td><td><b>${log.pair}</b></td><td>$${log.price.toFixed(log.price < 1 ? 6 : 2)}</td><td style="color:#10b981;font-weight:bold;">Executed</td></tr>`;
    });

    const totalEquity = totalUsdcWallet + (totalWplsWallet * 0.00001187);
    return `<!DOCTYPE html><html><head><title>Multi-Asset Portfolio</title><style>body{font-family:sans-serif;background:#0f0f11;color:#e2e8f0;padding:30px;margin:0;}.container{max-width:850px;margin:0 auto;}.card{background:#16161a;border:1px solid #24242b;padding:25px;border-radius:12px;margin-bottom:20px;}.lbl{font-size:13px;color:#94a3b8;text-transform:uppercase;margin-bottom:5px;}.val{font-size:28px;font-weight:bold;font-family:monospace;}.green-txt{color:#10b981;}table{width:100%;border-collapse:collapse;margin-top:15px;}th{text-align:left;padding:12px;background:#1e1e24;color:#94a3b8;font-size:12px;}td{padding:12px;border-bottom:1px solid #24242b;font-size:13px;}</style></head><body><div class="container"><div class="card" style="border-left:5px solid #10b981;"><div class="lbl">BOT STATE</div><div class="val" style="color:#10b981;">● MULTI-ASSET SCANNER ONLINE</div></div><div class="card"><div class="lbl">BALANCE MONITORS</div><div style="display:flex;justify-content:space-between;margin-top:15px;"><div><div class="lbl">USDC BALANCE</div><div class="val">$${totalUsdcWallet.toFixed(2)}</div></div><div><div class="lbl">RESERVE WPLS</div><div class="val">${totalWplsWallet.toLocaleString(undefined,{maximumFractionDigits:2})}</div></div></div></div><div class="card"><div class="lbl">NET PORTFOLIO VALUATION</div><div class="val green-txt">$${totalEquity.toFixed(2)} USD</div></div><div class="card"><div class="lbl">🕵️‍♂️ ACTIVE ASSET MATRICES (5 POOLS)</div><table><thead><tr><th>Trading Pair Pool</th><th>Status</th><th>Market Price</th><th>Baseline Anchor</th><th>Allocation Space</th></tr></thead><tbody>${poolRowsHtml}</tbody></table></div><div class="card"><div class="lbl">🗒️ RECENT TRANSACTION HISTORY</div><table><thead><tr><th>Action</th><th>Target Asset Pair</th><th>Price</th><th>Validation</th></tr></thead><tbody>${ledgerRowsHtml}</tbody></table></div></div></body></html>`;
}

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(generateHtmlLayout());
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`📡 Online on port ${PORT}`);
});
