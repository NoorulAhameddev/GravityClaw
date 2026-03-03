// ========================================
// Card Component
// Reusable card container with header, body, and footer
// ========================================

/**
 * Create a dashboard card
 * @param {Object} options - Card configuration
 * @param {string} options.title - Card title
 * @param {string} options.content - Card body content (HTML string)
 * @param {Array} options.actions - Array of action buttons {label, onClick, className}
 * @param {string} options.className - Additional CSS classes
 * @returns {HTMLElement} Card element
 */
function createCard(options = {}) {
    const {
        title = '',
        content = '',
        actions = [],
        className = ''
    } = options;
    
    const card = document.createElement('div');
    card.className = `dashboard-card ${className}`;
    
    let html = '';
    
    // Card header
    if (title) {
        html += `
            <div class="card-header">
                <h3>${title}</h3>
            </div>
        `;
    }
    
    // Card body
    html += `
        <div class="card-body">
            ${content}
        </div>
    `;
    
    // Card footer with actions
    if (actions.length > 0) {
        html += '<div class="card-footer">';
        actions.forEach((action, index) => {
            const btnClass = action.className || '';
            html += `
                <button class="card-action-btn ${btnClass}" data-action="${index}">
                    ${action.label}
                </button>
            `;
        });
        html += '</div>';
    }
    
    card.innerHTML = html;
    
    // Attach event handlers
    if (actions.length > 0) {
        actions.forEach((action, index) => {
            const btn = card.querySelector(`[data-action="${index}"]`);
            if (btn && action.onClick) {
                btn.addEventListener('click', action.onClick);
            }
        });
    }
    
    return card;
}

/**
 * Create a stat card for displaying metrics
 * @param {Object} options - Stat card configuration
 * @param {string} options.label - Metric label
 * @param {string} options.value - Metric value
 * @param {string} options.change - Change indicator (e.g., "+12%")
 * @param {string} options.trend - Trend direction: 'up', 'down', or 'neutral'
 * @param {string} options.icon - Optional SVG icon
 * @returns {HTMLElement} Stat card element
 */
function createStatCard(options = {}) {
    const {
        label = '',
        value = '0',
        change = '',
        trend = 'neutral',
        icon = ''
    } = options;
    
    const trendColors = {
        up: 'var(--success)',
        down: 'var(--error)',
        neutral: 'var(--text-secondary)'
    };
    
    const trendColor = trendColors[trend] || trendColors.neutral;
    
    const content = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
            <div style="flex: 1;">
                <div style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 4px;">
                    ${label}
                </div>
                <div style="color: var(--text-primary); font-size: 2rem; font-weight: 600; line-height: 1;">
                    ${value}
                </div>
            </div>
            ${icon ? `<div style="opacity: 0.5;">${icon}</div>` : ''}
        </div>
        ${change ? `
            <div style="display: flex; align-items: center; gap: 4px; font-size: 0.875rem; color: ${trendColor};">
                <span>${change}</span>
                <span style="font-size: 0.75rem;">vs last period</span>
            </div>
        ` : ''}
    `;
    
    return createCard({
        content,
        className: 'stat-card'
    });
}

// Export to global scope
window.createCard = createCard;
window.createStatCard = createStatCard;
