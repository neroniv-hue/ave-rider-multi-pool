/**
 * 🌊 MULTI-ASSET PORTFOLIO METRICS INTERFACE LAYER
 */
"use strict";

module.exports = function renderDashboard(data) {
    const usdcBal = data.totalUsdcWallet ?? 1500.00;
    const wplsBal = data.totalWplsWallet ?? 125000000.0;
    const pools = data.assetPools || [];
    const ledger = data.globalLedgerLogs || [];

    // 1. Calculate individual pool tracking grids
    let poolRowsHtml = "";
    let overallWplsEquityUsdc = 0;

    pools.forEach(p => {
        let statusLabel = p.position 
            ? `<span style="background:${p.position.type === 'LONG' ? '#10b981' : '#f43f5e'};color:white;padding:3px 6px;border-radius:4px;font-weight:bold;font-size:11px;">${p.position.type} ACTIVE</span>`
            : `<span style="background:#475569;color:white;padding:3px 6px;border-radius:4px;font-weight:bold;font-size:11px;">MONITORING</span>`;

        let positionDetails = p.position 
            ? `Entry: $${p.position.entry.toFixed(p.position.entry < 1 ? 6 : 2)}`
            : "No active slice allocation";

        poolRowsHtml += `
            <tr>
                <td><b>${p.name}</b></td>
                <td>${statusLabel}</td>
                <td>$${p.currentPrice.toFixed(p.currentPrice < 1 ? 6 : 2)}</td>
                <td>$${p.baseline.toFixed(p.baseline < 1 ? 6 : 2)}</td>
                <td><span style="font-family:monospace;color:#94a3b8;">${positionDetails}</span></td>
            </tr>
        `;
    });

    // 2. Format historic portfolio ledger timeline rows
    let ledgerRowsHtml = ledger.length === 0 ? '<tr><td colspan="4" style="text-align:center;color:#64748b;padding:12px;">No multi-pool trades logged yet.</td></tr>' : '';
    // Take the 5 most recent trades to display cleanly
    const recentTrades = [...ledger].reverse().slice(0, 5);
    recentTrades.forEach(log => {
        let actionColor = log.action.includes('ENTER') || log.action.includes('COVER') ? '#10b981' : '#ef4444';
        ledgerRowsHtml += `
            <tr>
                <td><span style="background:${actionColor};color:white;padding:2px 5px;border-radius:4px;font-size:11px;font-weight:bold;">${log.action}</span></td>
                <td><b>${log.pair}</b></td>
                <td>$${log.price.toFixed(log.price < 1 ? 6 : 2)}</td>
                <td style="color:#10b981;font-weight:bold;">Executed</td>
            </tr>
        `;
    });

    // 3. Compute net unified portfolio equity valuations
    const calculatedWplsValue = wplsBal * 0.00001187;
    const netTotalEquity = usdcBal + calculatedWplsValue;

    return `<!DOCTYPE html>
    <html>
    <head>
        <title>Wave Rider Multi-Asset Portfolio</title>
        <style>
            body { font-family: sans-serif; background: #0f0f11; color: #e2e8f0; padding: 30px; margin: 0; }
            .container { max-width: 850px; margin: 0 auto; }
            .card { background: #16161a; border: 1px solid #24242b; padding: 25px; border-radius: 12px; margin-bottom: 20px; }
            .lbl { font-size: 13px; color: #94a3b8; text-transform: uppercase; margin-bottom: 5px; letter-spacing: 0.5px; }
            .val { font-size: 28px; font-weight: bold; font-family: monospace; }
            .green-txt { color: #10b981; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th { text-align: left; padding: 12px; background: #1e1e24; color: #94a3b8; font-size: 12px; text-transform: uppercase; }
            td { padding: 12px; border-bottom: 1px solid #24242b; font-size: 13px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="card" style="border-left: 5px solid #10b981;">
                <div class="lbl">BOT GLOBAL ROUTER STATE</div>
                <div class="val" style="color: #10b981;">● MULTI-ASSET PORTFOLIO SCANNER ONLINE</div>
            </div>

            <div class="card">
                <div class="lbl">CONSOLIDATED LIQUIDITY MONITORS</div>
                <div style="display: flex; justify-content: space-between; margin-top: 15px;">
                    <div>
                        <div class="lbl">TOTAL MASTER USDC BALANCE</div>
                        <div class="val">$${usdcBal.toFixed(2)}</div>
                    </div>
                    <div>
                        <div class="lbl">TOTAL MASTER RESERVE WPLS</div>
                        <div class="val">${wplsBal.toLocaleString(undefined, {maximumFractionDigits:2})}</div>
                    </div>
                </div>
            </div>

            <div class="card">
                <div class="lbl">CONSOLIDATED NET PORTFOLIO EQUITIES WORTH</div>
                <div class="val green-txt">$${netTotalEquity.toFixed(2)} USD</div>
            </div>

            <div class="card">
                <div class="lbl">🕵️‍♂️ ACTIVE ASSET MATRICES MONITORS (5 LIQUIDITY POOLS)</div>
                <table>
                    <thead>
                        <tr>
                            <th>Trading Pair Pool</th>
                            <th>Execution Status</th>
                            <th>Spot Market Price</th>
                            <th>Baseline Anchor</th>
                            <th>Active Slice Allocation Space</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${poolRowsHtml}
                    </tbody>
                </table>
            </div>

            <div class="card">
                <div class="lbl">🗒️ RECENT ENGINE TRANSACTION EXECUTION HISTORY</div>
                <table>
                    <thead>
                        <tr>
                            <th>Action Type</th>
                            <th>Target Asset Pair</th>
                            <th>Execution Price</th>
                            <th>Network Validation</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${ledgerRowsHtml}
                    </tbody>
                </table>
            </div>
        </div>
    </body>
    </html>`;
};
