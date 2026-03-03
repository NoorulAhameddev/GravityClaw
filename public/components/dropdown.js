// ========================================
// Dropdown Component
// Select component for choosing options
// ========================================

/**
 * Create a dropdown selector
 * @param {Object} options - Dropdown configuration
 * @param {string} options.id - Unique identifier
 * @param {string} options.label - Dropdown label
 * @param {string} options.description - Optional description
 * @param {Array<Object>} options.options - Array of {value, label, disabled}
 * @param {string} options.value - Initial selected value
 * @param {Function} options.onChange - Callback when selection changes
 * @param {boolean} options.disabled - Disabled state
 * @returns {HTMLElement} Dropdown container element
 */
function createDropdown(options = {}) {
    const {
        id = `dropdown-${Math.random().toString(36).substr(2, 9)}`,
        label = '',
        description = '',
        options: selectOptions = [],
        value = '',
        onChange = () => {},
        disabled = false
    } = options;
    
    const container = document.createElement('div');
    container.className = 'dropdown-container';
    container.style.cssText = `
        margin-bottom: 16px;
    `;
    
    if (label) {
        const labelEl = document.createElement('label');
        labelEl.htmlFor = id;
        labelEl.style.cssText = `
            display: block;
            color: var(--text-primary);
            font-weight: 500;
            margin-bottom: 8px;
        `;
        labelEl.textContent = label;
        container.appendChild(labelEl);
    }
    
    if (description) {
        const descEl = document.createElement('div');
        descEl.style.cssText = `
            color: var(--text-secondary);
            font-size: 0.875rem;
            margin-bottom: 8px;
            line-height: 1.4;
        `;
        descEl.textContent = description;
        container.appendChild(descEl);
    }
    
    const select = document.createElement('select');
    select.id = id;
    select.disabled = disabled;
    select.style.cssText = `
        width: 100%;
        padding: 10px 14px;
        background: var(--bg-input);
        border: 1px solid var(--border-dim);
        border-radius: var(--radius-md);
        color: var(--text-primary);
        font-family: var(--font-main);
        font-size: 0.938rem;
        cursor: ${disabled ? 'not-allowed' : 'pointer'};
        opacity: ${disabled ? '0.5' : '1'};
        transition: all var(--transition-fast);
        appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a8adb8' stroke-width='2' xmlns='http://www.w3.org/2000/svg'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 14px center;
        padding-right: 40px;
    `;
    
    // Add options
    selectOptions.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        option.disabled = opt.disabled || false;
        if (opt.value === value) {
            option.selected = true;
        }
        select.appendChild(option);
    });
    
    // Handle change
    select.addEventListener('change', (e) => {
        onChange(e.target.value);
    });
    
    // Focus/blur styling
    select.addEventListener('focus', () => {
        select.style.borderColor = 'var(--border-bright)';
        select.style.outline = 'none';
    });
    
    select.addEventListener('blur', () => {
        select.style.borderColor = 'var(--border-dim)';
    });
    
    container.appendChild(select);
    
    // Store reference for external access
    container._getValue = () => select.value;
    container._setValue = (val) => {
        select.value = val;
    };
    
    return container;
}

/**
 * Create a custom styled dropdown with search capability
 * @param {Object} options - Dropdown configuration (same as createDropdown)
 * @returns {HTMLElement} Custom dropdown container
 */
function createSearchableDropdown(options = {}) {
    const container = document.createElement('div');
    container.className = 'searchable-dropdown';
    container.style.cssText = `
        position: relative;
        margin-bottom: 16px;
    `;
    
    // For now, use standard dropdown
    // TODO: Implement custom searchable version in future phase
    return createDropdown(options);
}

// Export to global scope
window.createDropdown = createDropdown;
window.createSearchableDropdown = createSearchableDropdown;
