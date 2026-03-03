// ========================================
// Analytics Page
// Usage statistics, costs, and performance metrics
// ========================================

async function loadAnalyticsPage() {
    const container = document.getElementById('dashboard-body');
    
    container.innerHTML = `
        <div class="dashboard-section">
            <div id="overview-stats"></div>
        </div>
        
        <div class="dashboard-section">
            <div class="section-header">
                <h2 class="section-title">Model Usage Breakdown</h2>
                <p class="section-description">Token consumption and costs by AI model</p>
            </div>
            <div id="model-breakdown"></div>
        </div>
        
        <div class="dashboard-section">
            <div class="section-header">
                <h2 class="section-title">Usage Over Time</h2>
                <p class="section-description">Last 24 hours activity</p>
            </div>
            <div id="usage-chart"></div>
        </div>
        
        <div class="dashboard-section">
            <div class="section-header">
                <h2 class="section-title">Recent API Calls</h2>
                <p class="section-description">Latest interactions with AI models</p>
            </div>
            <div id="recent-calls"></div>
        </div>
    `;
    
    // Load data
    await loadOverviewStats();
    await loadModelBreakdown();
    await loadUsageChart();
    await loadRecentCalls();
}

// ========== Overview Stats ==========
async function loadOverviewStats() {
    const container = document.getElementById('overview-stats');
    
    // Mock data - TODO: Replace with backend call
    const stats = await fetchUsageStats();
    
    const statsGrid = createStatGrid([
        {
            label: 'Total Tokens',
            value: formatNumber(stats.totalTokens),
            sparkline: stats.tokenHistory,
            color: 'var(--accent)'
        },
        {
            label: 'Total Cost',
            value: `$${stats.totalCost.toFixed(4)}`,
            unit: 'USD',
            sparkline: stats.costHistory,
            color: 'var(--warning)'
        },
        {
            label: 'Avg Latency',
            value: stats.avgLatency,
            unit: 'ms',
            sparkline: stats.latencyHistory,
            color: 'var(--success)'
        },
        {
            label: 'API Calls',
            value: formatNumber(stats.apiCalls),
            sparkline: stats.callHistory,
            color: 'var(--accent-light)'
        }
    ], 4);
    
    container.appendChild(statsGrid);
}

async function fetchUsageStats() {
    try {
        // Call real backend tool
        const sessionId = window.dashboard?.state?.sessionId || 'default';
        const result = await window.dashboard?.callTool?.('getUsageStats', { sessionId });
        
        if (!result || !result.success) {
            throw new Error('Failed to fetch usage stats');
        }
        
        const data = result.data;
        
        // Build sparklines from recent usage history
        const history = await window.dashboard?.callTool?.('getUsageHistory', { 
            sessionId, 
            limit: 8 
        });
        
        const tokenHistory = history?.data?.records?.map(r => r.totalTokens) || [];
        const costHistory = history?.data?.records?.map(r => r.cost) || [];
        const latencyHistory = history?.data?.records?.map(r => r.latency || 0) || [];
        
        return {
            totalTokens: data.totalTokens || 0,
            totalCost: data.totalCost || 0,
            avgLatency: Math.round(data.avgLatency || 0),
            apiCalls: data.totalCalls || 0,
            tokenHistory: tokenHistory.length > 0 ? tokenHistory : [0],
            costHistory: costHistory.length > 0 ? costHistory : [0],
            latencyHistory: latencyHistory.length > 0 ? latencyHistory : [0],
            callHistory: [data.totalCalls || 0]
        };
    } catch (error) {
        console.error('Failed to fetch usage stats:', error);
        showToast('Could not load usage stats', 'warning');
        return {
            totalTokens: 0,
            totalCost: 0,
            avgLatency: 0,
            apiCalls: 0,
            tokenHistory: [],
            costHistory: [],
            latencyHistory: [],
            callHistory: []
        };
    }
}

// ========== Model Breakdown ==========
async function loadModelBreakdown() {
    const container = document.getElementById('model-breakdown');
    
    const modelData = await fetchModelBreakdown();
    
    const grid = document.createElement('div');
    grid.className = 'dashboard-grid cols-2';
    
    modelData.forEach(model => {
        const card = createCard({
            title: model.name,
            content: `
                <div style="display: flex; flex-direction: column; gap: 16px;">
                    <div style="display: flex; justify-content: space-between;">
                        <div>
                            <div style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 4px;">Tokens Used</div>
                            <div style="color: var(--text-primary); font-size: 1.5rem; font-weight: 600;">${formatNumber(model.tokens)}</div>
                        </div>
                        <div style="text-align: right;">
                            <div style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 4px;">Cost</div>
                            <div style="color: var(--warning); font-size: 1.5rem; font-weight: 600;">$${model.cost.toFixed(4)}</div>
                        </div>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
                        <div>
                            <div style="color: var(--text-secondary); font-size: 0.75rem; margin-bottom: 2px;">Calls</div>
                            <div style="color: var(--text-primary); font-weight: 600;">${model.calls}</div>
                        </div>
                        <div>
                            <div style="color: var(--text-secondary); font-size: 0.75rem; margin-bottom: 2px;">Avg Latency</div>
                            <div style="color: var(--text-primary); font-weight: 600;">${model.avgLatency}ms</div>
                        </div>
                        <div>
                            <div style="color: var(--text-secondary); font-size: 0.75rem; margin-bottom: 2px;">Input</div>
                            <div style="color: var(--text-primary); font-weight: 600;">${formatNumber(model.inputTokens)}</div>
                        </div>
                        <div>
                            <div style="color: var(--text-secondary); font-size: 0.75rem; margin-bottom: 2px;">Output</div>
                            <div style="color: var(--text-primary); font-weight: 600;">${formatNumber(model.outputTokens)}</div>
                        </div>
                    </div>
                    
                    <div>
                        ${createBadge({ text: model.provider, variant: 'info', size: 'sm' }).outerHTML}
                    </div>
                </div>
            `
        });
        
        grid.appendChild(card);
    });
    
    container.appendChild(grid);
}

async function fetchModelBreakdown() {
    try {
        // Call real backend tool
        const sessionId = window.dashboard?.state?.sessionId || 'default';
        const result = await window.dashboard?.callTool?.('getModelBreakdown', { sessionId });
        
        if (!result || !result.success || !result.data) {
            throw new Error('Failed to fetch model breakdown');
        }
        
        // Transform backend data to match frontend expectations
        return result.data.map(item => ({
            name: item.modelName || item.model || 'Unknown',
            provider: item.provider || 'Unknown',
            tokens: item.tokens || 0,
            inputTokens: Math.round((item.tokens || 0) * 0.65), // Rough estimate
            outputTokens: Math.round((item.tokens || 0) * 0.35),
            cost: item.cost || 0,
            calls: item.calls || 0,
            avgLatency: Math.round(item.avgLatency || 0)
        }));
    } catch (error) {
        console.error('Failed to fetch model breakdown:', error);
        showToast('Could not load model breakdown', 'warning');
        return [];
    }
}

// ========== Usage Chart ==========
async function loadUsageChart() {
    const container = document.getElementById('usage-chart');
    
    const chartData = await fetchUsageHistory();
    
    // Create tabs for different views
    const tabContainer = document.createElement('div');
    tabContainer.style.cssText = `
        display: flex;
        gap: 8px;
        margin-bottom: 16px;
        border-bottom: 1px solid var(--border-dim);
        padding-bottom: 8px;
    `;
    
    const tabs = ['Tokens', 'Cost', 'Latency'];
    let activeTab = 'Tokens';
    
    tabs.forEach(tab => {
        const button = document.createElement('button');
        button.textContent = tab;
        button.style.cssText = `
            padding: 8px 16px;
            background: ${tab === activeTab ? 'var(--bg-card)' : 'transparent'};
            border: 1px solid ${tab === activeTab ? 'var(--border-bright)' : 'transparent'};
            border-radius: var(--radius-md);
            color: ${tab === activeTab ? 'var(--text-primary)' : 'var(--text-secondary)'};
            font-family: var(--font-main);
            font-size: 0.875rem;
            font-weight: 500;
            cursor: pointer;
            transition: all var(--transition-fast);
        `;
        
        button.addEventListener('click', () => {
            activeTab = tab;
            loadUsageChart(); // Reload with new tab
        });
        
        tabContainer.appendChild(button);
    });
    
    container.appendChild(tabContainer);
    
    // Render appropriate chart based on active tab
    let chart;
    if (activeTab === 'Tokens') {
        chart = createLineChart({
            data: chartData.tokens,
            title: '',
            height: '300px',
            color: 'var(--accent)',
            filled: true
        });
    } else if (activeTab === 'Cost') {
        chart = createLineChart({
            data: chartData.cost,
            title: '',
            height: '300px',
            color: 'var(--warning)',
            filled: true
        });
    } else {
        chart = createBarChart({
            data: chartData.latency,
            title: '',
            height: '300px',
            showValues: false
        });
    }
    
    container.appendChild(chart);
}

async function fetchUsageHistory() {
    try {
        // Call real backend tool
        const sessionId = window.dashboard?.state?.sessionId || 'default';
        const result = await window.dashboard?.callTool?.('getUsageHistory', { 
            sessionId,
            limit: 24  // Last 24 hours
        });
        
        if (!result || !result.success || !result.data?.records) {
            throw new Error('Failed to fetch usage history');
        }
        
        // Group by hour and aggregate
        const records = result.data.records;
        const hourlyData = {};
        
        records.forEach(record => {
            const date = new Date(record.timestamp);
            const hourKey = `${date.getHours()}:00`;
            
            if (!hourlyData[hourKey]) {
                hourlyData[hourKey] = { tokens: 0, cost: 0, latency: [], count: 0 };
            }
            
            hourlyData[hourKey].tokens += record.totalTokens;
            hourlyData[hourKey].cost += record.cost;
            if (record.latency) {
                hourlyData[hourKey].latency.push(record.latency);
            }
            hourlyData[hourKey].count++;
        });
        
        // Build chart data
        const hours = [];
        for (let i = 23; i >= 0; i--) {
            const hour = new Date();
            hour.setHours(hour.getHours() - i);
            const hourKey = `${hour.getHours()}:00`;
            hours.push({
                label: hourKey,
                data: hourlyData[hourKey] || { tokens: 0, cost: 0, latency: [0], count: 0 }
            });
        }
        
        return {
            tokens: hours.map(h => ({
                label: h.label,
                value: h.data.tokens
            })),
            cost: hours.map(h => ({
                label: h.label,
                value: h.data.cost.toFixed(4)
            })),
            latency: hours.map(h => ({
                label: h.label,
                value: h.data.latency.length > 0 
                    ? Math.round(h.data.latency.reduce((a, b) => a + b, 0) / h.data.latency.length)
                    : 0,
                color: 'var(--success)'
            }))
        };
    } catch (error) {
        console.error('Failed to fetch usage history:', error);
        showToast('Could not load usage history', 'warning');
        return { tokens: [], cost: [], latency: [] };
    }
}

// ========== Recent API Calls ==========
async function loadRecentCalls() {
    const container = document.getElementById('recent-calls');
    
    const calls = await fetchRecentCalls();
    
    if (calls.length === 0) {
        container.appendChild(createEmptyChart('No recent API calls'));
        return;
    }
    
    const table = document.createElement('div');
    table.style.cssText = `
        background: var(--bg-card);
        border: 1px solid var(--border-dim);
        border-radius: var(--radius-lg);
        overflow: hidden;
    `;
    
    // Table header
    const header = document.createElement('div');
    header.style.cssText = `
        display: grid;
        grid-template-columns: 140px 1fr 120px 100px 100px 100px;
        padding: 16px;
        border-bottom: 1px solid var(--border-dim);
        background: var(--bg-input);
        font-weight: 600;
        color: var(--text-primary);
        font-size: 0.875rem;
    `;
    header.innerHTML = `
        <div>Time</div>
        <div>Model</div>
        <div>Provider</div>
        <div>Tokens</div>
        <div>Cost</div>
        <div>Latency</div>
    `;
    table.appendChild(header);
    
    // Table rows
    calls.forEach((call, index) => {
        const row = document.createElement('div');
        row.style.cssText = `
            display: grid;
            grid-template-columns: 140px 1fr 120px 100px 100px 100px;
            padding: 16px;
            ${index < calls.length - 1 ? 'border-bottom: 1px solid var(--border-dim);' : ''}
            font-size: 0.875rem;
            color: var(--text-secondary);
            transition: background var(--transition-fast);
        `;
        row.addEventListener('mouseenter', () => {
            row.style.background = 'var(--bg-hover)';
        });
        row.addEventListener('mouseleave', () => {
            row.style.background = 'transparent';
        });
        
        row.innerHTML = `
            <div style="color: var(--text-secondary);">${formatTime(call.timestamp)}</div>
            <div style="color: var(--text-primary); font-weight: 500;">${call.model}</div>
            <div>${createBadge({ text: call.provider, variant: 'info', size: 'sm', pill: true }).outerHTML}</div>
            <div style="color: var(--text-primary);">${formatNumber(call.tokens)}</div>
            <div style="color: var(--warning); font-weight: 500;">$${call.cost.toFixed(4)}</div>
            <div style="color: var(--success);">${call.latency}ms</div>
        `;
        
        table.appendChild(row);
    });
    
    container.appendChild(table);
}

async function fetchRecentCalls() {
    try {
        // Call real backend tool
        const sessionId = window.dashboard?.state?.sessionId || 'default';
        const result = await window.dashboard?.callTool?.('getUsageHistory', { 
            sessionId,
            limit: 10  // Recent 10 calls
        });
        
        if (!result || !result.success || !result.data?.records) {
            throw new Error('Failed to fetch recent calls');
        }
        
        return result.data.records.map(record => ({
            timestamp: new Date(record.timestamp),
            model: record.model || 'Unknown',
            provider: record.provider || 'Unknown',
            tokens: record.totalTokens,
            cost: record.cost,
            latency: record.latency || 0
        }));
    } catch (error) {
        console.error('Failed to fetch recent calls:', error);
        showToast('Could not load recent calls', 'warning');
        return [];
    }
}

// ========== Utility Functions ==========
function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(2) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
}

function formatTime(date) {
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) {
        return 'Just now';
    } else if (diff < 3600000) {
        return Math.floor(diff / 60000) + 'm ago';
    } else if (diff < 86400000) {
        return Math.floor(diff / 3600000) + 'h ago';
    } else {
        return date.toLocaleString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    }
}

// Make loadAnalyticsPage available globally
window.loadAnalyticsPage = loadAnalyticsPage;
