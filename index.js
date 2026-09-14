/**
 * 🌊 WAVE RIDER MULTI-ASSET PORTFOLIO RISK ENGINE & INTERFACE LAYER (LIVE ON-CHAIN DATA)
 * RUNTIME REQUIREMENTS: Node.js (Zero external code dependencies)
 */
"use strict";
const http = require('http');
const https = require('https');

// Master capital allocations setup ($1500.00 USDC / 125M WPLS)
let totalUsdcWallet = 1500.00;
let totalWplsWallet = 125000000.0;

// Multi-Asset tracking arrays mapping official deep on-chain liquidity pools across PulseX V2
const assetPools = [
    { name: "WPLS/USDC", contract: "0xe56043671df55de5cdf8459710433c10324de0ae", currentPrice: 0.00001187, baseline: 0.00001182, rollingWindow: [], position: null, reverseDecimals: false },
    { name: "PLSX/WPLS", contract: "0x149b2c2d2cb2fbf23bb1d0b30bb224ba46066f9f", currentPrice: 0.03450000, baseline: 0.03410000, rollingWindow: [], position: null, reverseDecimals: false },
    { name: "HEX/WPLS",  contract: "0xf1f4ee610b2babb05c635f726ef8b0c568c8dc65", currentPrice: 0.12500000, baseline: 0.12350000, rollingWindow: [], position: null, reverseDecimals: false },
    { name: "DAI/WPLS",  contract: "0xe56043671df55de5cdf8459710433c10324de0ae", currentPrice: 84200.0000, baseline: 84000.0000, rollingWindow: [], position: null, reverseDecimals: true },
    { name: "INC/WPLS",  contract: "0xf808bb6265e9ca27002c0a04562bf50d4fe37eaa", currentPrice: 12200.0000, baseline: 12150.0000, rollingWindow: [], position: null, reverseDecimals: true }
];

let globalLedgerLogs = [];

// Lightweight post channel utility to query public blockchain nodes via native RPC protocols
function queryOnChainReserves(contractAddress) {
    return new Promise((resolve) => {
        const payloadData = JSON.stringify({
            jsonrpc: "2.0",
            method: "eth_call",
            params: [{
                to: contractAddress,
                data: "0x0902f1ac" // Standard ERC20/UniswapV2 Pair getReserves() signature selector hash
            }, "latest"],
            id: 1
        });

        const reqOptions = {
            hostname: 'rpc.pulsechain.com',
            port: 443,
            path: '/',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': payloadData.length
            }
        };

        const postQuery = https.request(reqOptions, (res) => {
            let chunkBuffer = '';
            res.on('data', (d) => chunkBuffer += d);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(chunkBuffer);
                    if (parsed.result && parsed.result !== "0x") {
                        // Strip hex buffer parts to unpack Reserve0 and Reserve1 parameter allocations
                        const rawR0 = BigInt("0x" + parsed.result.slice(2, 66));
                        const rawR1 = BigInt("0x" + parsed.result.slice(66, 130));
                        resolve({ r0: Number(rawR0) / 1e18, r1: Number(rawR1) / 1e18 });
                    } else { resolve(null); }
                } catch (e) { resolve(null); }
            });
        });

        postQuery.on('error', () => resolve(null));
        postQuery.write(payloadData);
        postQuery.end();
    });
}

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

async function executeLiveBlockchainPricedSimulation() {
    // Sequentially download actual, live smart contract states via the RPC layer
    for (let i = 0; i < assetPools.length; i++) {
        const pool = assetPools[i];
        const reserves = await queryOnChainReserves(pool.contract);
        if (reserves && reserves.r0 > 0 && reserves.r1 > 0) {
            let calculatedPrice = pool.reverseDecimals 
                ? (reserves.r0 / reserves.r1) 
                : (reserves.r1 / reserves.r0);
            
            // Handle WPLS/USDC stable scaling parameters safely
            if (pool.name === "WPLS/USDC") calculatedPrice = calculatedPrice * 1e12; 

            pool.currentPrice = calculatedPrice;
            processMultiAssetEngine(pool, calculatedPrice);
        }
    }
}

async function generateHtmlLayout() {
    await executeLiveBlockchainPricedSimulation();
    
    let poolRowsHtml = "";
    assetPools.forEach(p => {
        let label = p.position ? `<span style="background:${p.position.type==='LONG'?'#10b981':'#f43f5e'};color:white;padding:3px 6px;border-radius:4px;font-weight:bold;font-size:11px;">${p.position.type} ACTIVE</span>` : `<span style="background:#475569;color:white;padding:3px 6px;border-radius:4px;font-weight:bold;font-size:11px;">MONITORING</span>`;
        let decPlaces = p.currentPrice < 0.01 ? 8 : (p.currentPrice > 1000 ? 2 : 4);
        let details = p.position ? `Entry: ${p.position.entry.toFixed(decPlaces)}` : "No active allocation";
        poolRowsHtml += `<tr><td><b>${p.name}</b></td><td>${label}</td><td>${p.currentPrice.toFixed(decPlaces)}</td><td>${p.baseline.toFixed(decPlaces)}</td><td><span style="color:#94a3b8;">${details}</span></td></tr>`;
    });

    let ledgerRowsHtml = globalLedgerLogs.length === 0 ? '<tr><td colspan="4" style="text-align:center;color:#64748b;padding:12px;">No live on-chain trades generated inside this session segment yet.</td></tr>' : '';
    [...globalLedgerLogs].reverse().slice(0, 5).forEach(log => {
        let col = log.action.includes('ENTER') || log.action.includes('COVER') ? '#10b981' : '#ef4444';
        let logDecPlaces = log.price < 0.01 ? 8 : (log.price > 1000 ? 2 : 4);
        ledgerRowsHtml += `<tr><td><span style="background:${col};color:white;padding:2px 5px;border-radius:4px;font-size:11px;font-weight:bold;">${log.action}</span></td><td><b>${log.pair}</b></td><td>${log.price.toFixed(logDecPlaces)}</td><td style="color:#10b981;font-weight:bold;">Verified</td></tr>`;
    });

    // Find live WPLS rate to construct an accurate USD valuation summary
    const wplsLiveAnchor = assetPools.find(p => p.name === "WPLS/USDC")?.currentPrice || 0.00001187;
    const totalEquity = totalUsdcWallet + (totalWplsWallet * wplsLiveAnchor);
    
