// ========================================
// Chart Component
// Lightweight charting using CSS and SVG
// ========================================

/**
 * Create a simple bar chart
 * @param {Object} options - Chart configuration
 * @param {Array<Object>} options.data - Array of {label, value, color?}
 * @param {string} options.title - Chart title
 * @param {string} options.height - Chart height (default: '200px')
 * @param {boolean} options.showValues - Show values on bars
 * @param {boolean} options.horizontal - Horizontal orientation
 * @returns {HTMLElement} Bar chart element
 */
function createBarChart(options = {}) {
    const {
        data = [],
        title = '',
        height = '200px',
        showValues = true,
        horizontal = false
    } = options;
    
    if (data.length === 0) {
        return createEmptyChart('No data available');
    }
    
    const container = document.createElement('div');
    container.className = 'chart-container';
    container.style.cssText = `
        background: var(--bg-card);
        border: 1px solid var(--border-dim);
        border-radius: var(--radius-lg);
        padding: 20px;
    `;
    
    if (title) {
        const titleEl = document.createElement('h4');
        titleEl.style.cssText = `
            font-size: 1rem;
            font-weight: 600;
            color: var(--text-primary);
            margin-bottom: 16px;
        `;
        titleEl.textContent = title;
        container.appendChild(titleEl);
    }
    
    const chart = document.createElement('div');
    chart.className = 'bar-chart';
    chart.style.cssText = `
        display: flex;
        ${horizontal ? 'flex-direction: column' : 'align-items: flex-end'};
        gap: ${horizontal ? '12px' : '8px'};
        height: ${height};
        ${!horizontal ? 'justify-content: flex-end;' : ''}
    `;
    
    const maxValue = Math.max(...data.map(d => d.value));
    
    data.forEach(item => {
        const percentage = (item.value / maxValue) * 100;
        const color = item.color || 'var(--accent)';
        
        const barContainer = document.createElement('div');
        barContainer.style.cssText = `
            ${horizontal ? 'width: 100%;' : 'flex: 1; display: flex; flex-direction: column; justify-content: flex-end;'}
        `;
        
        if (horizontal) {
            barContainer.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="min-width: 80px; color: var(--text-secondary); font-size: 0.875rem; text-align: right;">
                        ${item.label}
                    </div>
                    <div style="flex: 1; background: rgba(255,255,255,0.05); border-radius: 4px; height: 24px; position: relative; overflow: hidden;">
                        <div style="
                            width: ${percentage}%;
                            height: 100%;
                            background: ${color};
                            border-radius: 4px;
                            transition: width 0.5s ease-out;
                        "></div>
                    </div>
                    ${showValues ? `<div style="min-width: 60px; color: var(--text-primary); font-size: 0.875rem; font-weight: 600;">${item.value}</div>` : ''}
                </div>
            `;
        } else {
            barContainer.innerHTML = `
                <div style="
                    width: 100%;
                    height: ${percentage}%;
                    background: ${color};
                    border-radius: 4px 4px 0 0;
                    transition: height 0.5s ease-out;
                    position: relative;
                    min-height: 4px;
                ">
                    ${showValues ? `<div style="position: absolute; top: -24px; left: 50%; transform: translateX(-50%); color: var(--text-primary); font-size: 0.75rem; font-weight: 600; white-space: nowrap;">${item.value}</div>` : ''}
                </div>
                <div style="
                    margin-top: 8px;
                    color: var(--text-secondary);
                    font-size: 0.75rem;
                    text-align: center;
                    word-break: break-word;
                ">
                    ${item.label}
                </div>
            `;
        }
        
        chart.appendChild(barContainer);
    });
    
    container.appendChild(chart);
    return container;
}

/**
 * Create a line chart using SVG
 * @param {Object} options - Chart configuration
 * @param {Array<Object>} options.data - Array of {label, value}
 * @param {string} options.title - Chart title
 * @param {string} options.height - Chart height
 * @param {string} options.color - Line color
 * @param {boolean} options.filled - Fill area under line
 * @returns {HTMLElement} Line chart element
 */
function createLineChart(options = {}) {
    const {
        data = [],
        title = '',
        height = '200px',
        color = 'var(--accent)',
        filled = true
    } = options;
    
    if (data.length === 0) {
        return createEmptyChart('No data available');
    }
    
    const container = document.createElement('div');
    container.className = 'chart-container';
    container.style.cssText = `
        background: var(--bg-card);
        border: 1px solid var(--border-dim);
        border-radius: var(--radius-lg);
        padding: 20px;
    `;
    
    if (title) {
        const titleEl = document.createElement('h4');
        titleEl.style.cssText = `
            font-size: 1rem;
            font-weight: 600;
            color: var(--text-primary);
            margin-bottom: 16px;
        `;
        titleEl.textContent = title;
        container.appendChild(titleEl);
    }
    
    const width = 600;
    const chartHeight = parseInt(height);
    const padding = 40;
    const maxValue = Math.max(...data.map(d => d.value));
    const minValue = Math.min(...data.map(d => d.value));
    const range = maxValue - minValue || 1;
    
    // Calculate points
    const points = data.map((item, index) => {
        const x = padding + (index / (data.length - 1)) * (width - 2 * padding);
        const y = chartHeight - padding - ((item.value - minValue) / range) * (chartHeight - 2 * padding);
        return { x, y, value: item.value, label: item.label };
    });
    
    // Create SVG path
    const pathData = points.map((p, i) => 
        `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`
    ).join(' ');
    
    // Create filled area path
    const areaData = filled ? 
        `${pathData} L ${points[points.length - 1].x} ${chartHeight - padding} L ${padding} ${chartHeight - padding} Z` : 
        '';
    
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', `0 0 ${width} ${chartHeight}`);
    svg.style.cssText = 'display: block;';
    
    svg.innerHTML = `
        <!-- Filled area -->
        ${filled ? `<path d="${areaData}" fill="${color}" fill-opacity="0.1"/>` : ''}
        
        <!-- Line -->
        <path d="${pathData}" 
              stroke="${color}" 
              stroke-width="2" 
              fill="none" 
              stroke-linecap="round" 
              stroke-linejoin="round"/>
        
        <!-- Points -->
        ${points.map(p => `
            <circle cx="${p.x}" cy="${p.y}" r="4" fill="${color}">
                <title>${p.label}: ${p.value}</title>
            </circle>
        `).join('')}
        
        <!-- X-axis labels -->
        ${points.map((p, i) => data.length <= 10 || i % Math.ceil(data.length / 10) === 0 ? `
            <text x="${p.x}" 
                  y="${chartHeight - 10}" 
                  text-anchor="middle" 
                  fill="var(--text-secondary)" 
                  font-size="12">
                ${p.label}
            </text>
        ` : '').join('')}
    `;
    
    container.appendChild(svg);
    return container;
}

/**
 * Create a donut/pie chart
 * @param {Object} options - Chart configuration
 * @param {Array<Object>} options.data - Array of {label, value, color?}
 * @param {string} options.title - Chart title
 * @param {boolean} options.donut - Donut style (hollow center)
 * @param {string} options.centerText - Text to display in center (donut only)
 * @returns {HTMLElement} Donut chart element
 */
function createDonutChart(options = {}) {
    const {
        data = [],
        title = '',
        donut = true,
        centerText = ''
    } = options;
    
    if (data.length === 0) {
        return createEmptyChart('No data available');
    }
    
    const container = document.createElement('div');
    container.className = 'chart-container';
    container.style.cssText = `
        background: var(--bg-card);
        border: 1px solid var(--border-dim);
        border-radius: var(--radius-lg);
        padding: 20px;
        display: flex;
        gap: 24px;
        align-items: center;
    `;
    
    const total = data.reduce((sum, item) => sum + item.value, 0);
    const size = 160;
    const strokeWidth = donut ? 30 : size / 2;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    
    const chartContainer = document.createElement('div');
    chartContainer.style.cssText = 'position: relative; flex-shrink: 0;';
    
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    
    const colors = [
        'var(--accent)',
        'var(--success)',
        'var(--warning)',
        'var(--error)',
        '#8b5cf6',
        '#ec4899'
    ];
    
    let currentAngle = -90;
    
    data.forEach((item, index) => {
        const percentage = (item.value / total) * 100;
        const angle = (percentage / 100) * 360;
        const color = item.color || colors[index % colors.length];
        
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', size / 2);
        circle.setAttribute('cy', size / 2);
        circle.setAttribute('r', radius);
        circle.setAttribute('fill', 'none');
        circle.setAttribute('stroke', color);
        circle.setAttribute('stroke-width', strokeWidth);
        circle.setAttribute('stroke-dasharray', `${(angle / 360) * circumference} ${circumference}`);
        circle.setAttribute('transform', `rotate(${currentAngle} ${size / 2} ${size / 2})`);
        circle.style.transition = 'stroke-dasharray 0.5s ease-out';
        
        svg.appendChild(circle);
        currentAngle += angle;
    });
    
    chartContainer.appendChild(svg);
    
    // Center text for donut
    if (donut && centerText) {
        const centerLabel = document.createElement('div');
        centerLabel.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            text-align: center;
            color: var(--text-primary);
            font-weight: 600;
        `;
        centerLabel.textContent = centerText;
        chartContainer.appendChild(centerLabel);
    }
    
    const legendContainer = document.createElement('div');
    legendContainer.style.cssText = 'flex: 1;';
    
    if (title) {
        const titleEl = document.createElement('h4');
        titleEl.style.cssText = `
            font-size: 1rem;
            font-weight: 600;
            color: var(--text-primary);
            margin-bottom: 16px;
        `;
        titleEl.textContent = title;
        legendContainer.appendChild(titleEl);
    }
    
    // Legend
    const legend = document.createElement('div');
    legend.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';
    
    data.forEach((item, index) => {
        const percentage = ((item.value / total) * 100).toFixed(1);
        const color = item.color || colors[index % colors.length];
        
        const legendItem = document.createElement('div');
        legendItem.style.cssText = 'display: flex; align-items: center; gap: 8px;';
        legendItem.innerHTML = `
            <div style="width: 12px; height: 12px; background: ${color}; border-radius: 2px; flex-shrink: 0;"></div>
            <div style="flex: 1; color: var(--text-secondary); font-size: 0.875rem;">${item.label}</div>
            <div style="color: var(--text-primary); font-weight: 600; font-size: 0.875rem;">${percentage}%</div>
        `;
        legend.appendChild(legendItem);
    });
    
    legendContainer.appendChild(legend);
    
    container.appendChild(chartContainer);
    container.appendChild(legendContainer);
    
    return container;
}

/**
 * Create an empty chart placeholder
 * @param {string} message - Message to display
 * @returns {HTMLElement} Empty chart element
 */
function createEmptyChart(message = 'No data available') {
    const container = document.createElement('div');
    container.className = 'chart-container';
    container.style.cssText = `
        background: var(--bg-card);
        border: 1px solid var(--border-dim);
        border-radius: var(--radius-lg);
        padding: 40px;
        text-align: center;
        color: var(--text-secondary);
    `;
    container.innerHTML = `
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity: 0.5; margin-bottom: 16px;">
            <line x1="12" y1="20" x2="12" y2="10"></line>
            <line x1="18" y1="20" x2="18" y2="4"></line>
            <line x1="6" y1="20" x2="6" y2="16"></line>
        </svg>
        <p>${message}</p>
    `;
    return container;
}

// Export to global scope
window.createBarChart = createBarChart;
window.createLineChart = createLineChart;
window.createDonutChart = createDonutChart;
window.createEmptyChart = createEmptyChart;
