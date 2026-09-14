// Create a secure web routing layer to serve the HTML dashboard template
const server = http.createServer((req, res) => {
    // Force a fresh calculation pass to get the newest ticks
    startMultiAssetSimulation();
    
    // Package all active engine metrics into a clean payload object
    const systemStatePayload = {
        totalUsdcWallet,
        totalWplsWallet,
        assetPools,
        globalLedgerLogs
    };
    
    // Load the dashboard view layout
    const renderDashboard = require('./dashboard');
    
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(renderDashboard(systemStatePayload));
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`📡 Multi-pool free dashboard interface online on port ${PORT}`);
});
