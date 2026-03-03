// ========================================
// Stat Block Component
// Display metrics with optional sparklines
// ========================================

/**
 * Create a stat block with optional trend indicator
 * @param {Object} options - Stat block configuration
 * @param {string} options.label - Stat label
 * @param {string} options.value - Stat value
 * @param {string} options.unit - Optional unit (e.g., "ms", "%", "$")
 * @param {Array<number>} options.sparkline - Optional data points for sparkline
 * @param {string} options.color - Optional color for sparkline
 * @returns {HTMLElement} Stat block element
 */
function createStatBlock(options = {}) {
    const {
        label = '',
        value = '0',
        unit = '',
        sparkline = [],
        color = 'var(--accent)'
    } = options;
    
    const block = document.createElement('div');
    block.className = 'stat-block';
    block.style.cssText = `
        padding: 16px;
        background: var(--bg-card);
        border: 1px solid var(--border-dim);
        border-radius: var(--radius-md);
        transition: all var(--transition-fast);
    `;
    
    let html = `
        <div style="margin-bottom: 8px; color: var(--text-secondary); font-size: 0.875rem;">
            ${label}
        </div>
        <div style="display: flex; align-items: baseline; gap: 4px; margin-bottom: ${sparkline.length > 0 ? '12px' : '0'};">
            <span style="font-size: 1.75rem; font-weight: 600; color: var(--text-primary);">
                ${value}
            </span>
            ${unit ? `<span style="font-size: 0.875rem; color: var(--text-secondary);">${unit}</span>` : ''}
        </div>
    `;
    
    // Add sparkline if data provided
    if (sparkline.length > 0) {
        html += createSparkline(sparkline, color);
    }
    
    block.innerHTML = html;
    
    return block;
}

/**
 * Create a simple CSS-based sparkline
 * @param {Array<number>} data - Data points
 * @param {string} color - Line color
 * @returns {string} HTML string for sparkline
 */
function createSparkline(data, color) {
    if (!data || data.length === 0) return '';
    
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    const width = 100 / data.length;
    
    const bars = data.map((value, index) => {
        const height = ((value - min) / range) * 100;
        return `
            <div style="
                width: ${width}%;
                height: ${height}%;
                background: ${color};
                opacity: ${0.3 + (index / data.length) * 0.7};
                border-radius: 2px;
            "></div>
        `;
    }).join('');
    
    return `
        <div style="
            display: flex;
            align-items: flex-end;
            gap: 2px;
            height: 32px;
            opacity: 0.8;
        ">
            ${bars}
        </div>
    `;
}

/**
 * Create a grid of stat blocks
 * @param {Array<Object>} stats - Array of stat configurations
 * @param {number} columns - Number of columns (1-4)
 * @returns {HTMLElement} Grid container with stat blocks
 */
function createStatGrid(stats, columns = 4) {
    const grid = document.createElement('div');
    grid.className = `dashboard-grid cols-${columns}`;
    
    stats.forEach(stat => {
        grid.appendChild(createStatBlock(stat));
    });
    
    return grid;
}

// Export to global scope
window.createStatBlock = createStatBlock;
window.createStatGrid = createStatGrid;
window.createSparkline = createSparkline;
