// ========================================
// Badge Component
// Status indicators and role badges
// ========================================

/**
 * Create a badge element
 * @param {Object} options - Badge configuration
 * @param {string} options.text - Badge text
 * @param {string} options.variant - Badge variant: 'default', 'success', 'warning', 'error', 'info'
 * @param {string} options.size - Badge size: 'sm', 'md', 'lg'
 * @param {boolean} options.pill - Pill-shaped badge
 * @param {string} options.icon - Optional SVG icon
 * @returns {HTMLElement} Badge element
 */
function createBadge(options = {}) {
    const {
        text = '',
        variant = 'default',
        size = 'md',
        pill = false,
        icon = ''
    } = options;
    
    const variantStyles = {
        default: {
            background: 'var(--bg-input)',
            color: 'var(--text-secondary)',
            border: 'var(--border-dim)'
        },
        success: {
            background: 'rgba(16, 185, 129, 0.1)',
            color: 'var(--success)',
            border: 'rgba(16, 185, 129, 0.3)'
        },
        warning: {
            background: 'rgba(245, 158, 11, 0.1)',
            color: 'var(--warning)',
            border: 'rgba(245, 158, 11, 0.3)'
        },
        error: {
            background: 'rgba(239, 68, 68, 0.1)',
            color: 'var(--error)',
            border: 'rgba(239, 68, 68, 0.3)'
        },
        info: {
            background: 'rgba(99, 102, 241, 0.1)',
            color: 'var(--accent)',
            border: 'rgba(99, 102, 241, 0.3)'
        },
        primary: {
            background: 'var(--accent)',
            color: 'white',
            border: 'var(--accent)'
        }
    };
    
    const sizeStyles = {
        sm: {
            padding: '2px 8px',
            fontSize: '0.75rem'
        },
        md: {
            padding: '4px 12px',
            fontSize: '0.813rem'
        },
        lg: {
            padding: '6px 16px',
            fontSize: '0.875rem'
        }
    };
    
    const style = variantStyles[variant] || variantStyles.default;
    const sizing = sizeStyles[size] || sizeStyles.md;
    
    const badge = document.createElement('span');
    badge.className = `badge badge-${variant} badge-${size}`;
    badge.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: ${sizing.padding};
        background: ${style.background};
        color: ${style.color};
        border: 1px solid ${style.border};
        border-radius: ${pill ? '999px' : 'var(--radius-sm)'};
        font-size: ${sizing.fontSize};
        font-weight: 500;
        line-height: 1;
        white-space: nowrap;
    `;
    
    if (icon) {
        badge.innerHTML = `${icon}<span>${text}</span>`;
    } else {
        badge.textContent = text;
    }
    
    return badge;
}

/**
 * Create a status badge with dot indicator
 * @param {string} status - Status text
 * @param {string} variant - Status variant (same as badge)
 * @returns {HTMLElement} Status badge element
 */
function createStatusBadge(status, variant = 'default') {
    const dot = `
        <svg width="8" height="8" viewBox="0 0 8 8" style="flex-shrink: 0;">
            <circle cx="4" cy="4" r="3" fill="currentColor"/>
        </svg>
    `;
    
    return createBadge({
        text: status,
        variant,
        icon: dot,
        pill: true
    });
}

/**
 * Create a role badge
 * @param {string} role - Role name (e.g., 'Admin', 'Owner', 'Member')
 * @returns {HTMLElement} Role badge element
 */
function createRoleBadge(role) {
    const roleVariants = {
        'Admin': 'error',
        'Owner': 'primary',
        'Moderator': 'warning',
        'Member': 'default',
        'Bot': 'info'
    };
    
    const variant = roleVariants[role] || 'default';
    
    return createBadge({
        text: role,
        variant,
        size: 'sm',
        pill: true
    });
}

/**
 * Create a count badge (for notifications, etc.)
 * @param {number} count - Count value
 * @param {number} max - Maximum count to display (shows "99+" if exceeded)
 * @returns {HTMLElement} Count badge element
 */
function createCountBadge(count, max = 99) {
    const displayCount = count > max ? `${max}+` : count.toString();
    
    const badge = document.createElement('span');
    badge.className = 'count-badge';
    badge.style.cssText = `
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 20px;
        height: 20px;
        padding: 0 6px;
        background: var(--accent);
        color: white;
        border-radius: 10px;
        font-size: 0.75rem;
        font-weight: 600;
        line-height: 1;
    `;
    badge.textContent = displayCount;
    
    return badge;
}

/**
 * Create a badge group container
 * @param {Array<HTMLElement>} badges - Array of badge elements
 * @param {number} gap - Gap between badges (in px)
 * @returns {HTMLElement} Badge group container
 */
function createBadgeGroup(badges, gap = 8) {
    const group = document.createElement('div');
    group.className = 'badge-group';
    group.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: ${gap}px;
        flex-wrap: wrap;
    `;
    
    badges.forEach(badge => {
        group.appendChild(badge);
    });
    
    return group;
}

// Export to global scope
window.createBadge = createBadge;
window.createStatusBadge = createStatusBadge;
window.createRoleBadge = createRoleBadge;
window.createCountBadge = createCountBadge;
window.createBadgeGroup = createBadgeGroup;
