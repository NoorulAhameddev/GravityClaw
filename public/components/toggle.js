// ========================================
// Toggle Switch Component
// Boolean on/off switches for settings
// ========================================

/**
 * Create a toggle switch
 * @param {Object} options - Toggle configuration
 * @param {string} options.id - Unique identifier
 * @param {string} options.label - Toggle label
 * @param {string} options.description - Optional description text
 * @param {boolean} options.checked - Initial state
 * @param {Function} options.onChange - Callback when toggled
 * @param {boolean} options.disabled - Disabled state
 * @returns {HTMLElement} Toggle container element
 */
function createToggle(options = {}) {
    const {
        id = `toggle-${Math.random().toString(36).substr(2, 9)}`,
        label = '',
        description = '',
        checked = false,
        onChange = () => {},
        disabled = false
    } = options;
    
    const container = document.createElement('div');
    container.className = 'toggle-container';
    container.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 0;
        gap: 16px;
    `;
    
    const labelContainer = document.createElement('div');
    labelContainer.style.cssText = 'flex: 1;';
    
    const labelEl = document.createElement('label');
    labelEl.htmlFor = id;
    labelEl.style.cssText = `
        color: var(--text-primary);
        font-weight: 500;
        cursor: ${disabled ? 'not-allowed' : 'pointer'};
        user-select: none;
    `;
    labelEl.textContent = label;
    
    labelContainer.appendChild(labelEl);
    
    if (description) {
        const descEl = document.createElement('div');
        descEl.style.cssText = `
            color: var(--text-secondary);
            font-size: 0.875rem;
            margin-top: 4px;
            line-height: 1.4;
        `;
        descEl.textContent = description;
        labelContainer.appendChild(descEl);
    }
    
    const toggleWrapper = document.createElement('div');
    toggleWrapper.style.cssText = 'position: relative;';
    
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = id;
    input.checked = checked;
    input.disabled = disabled;
    input.style.cssText = 'display: none;';
    
    const slider = document.createElement('div');
    slider.className = 'toggle-slider';
    slider.style.cssText = `
        width: 44px;
        height: 24px;
        background: ${checked ? 'var(--accent)' : 'var(--bg-input)'};
        border-radius: 12px;
        position: relative;
        transition: background var(--transition-fast);
        cursor: ${disabled ? 'not-allowed' : 'pointer'};
        opacity: ${disabled ? '0.5' : '1'};
    `;
    
    const knob = document.createElement('div');
    knob.style.cssText = `
        width: 18px;
        height: 18px;
        background: white;
        border-radius: 50%;
        position: absolute;
        top: 3px;
        left: ${checked ? '23px' : '3px'};
        transition: left var(--transition-fast);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    `;
    
    slider.appendChild(knob);
    toggleWrapper.appendChild(input);
    toggleWrapper.appendChild(slider);
    
    // Handle toggle interaction
    const toggle = () => {
        if (disabled) return;
        
        const newState = !input.checked;
        input.checked = newState;
        
        // Update visual state
        slider.style.background = newState ? 'var(--accent)' : 'var(--bg-input)';
        knob.style.left = newState ? '23px' : '3px';
        
        // Trigger callback
        onChange(newState);
    };
    
    slider.addEventListener('click', toggle);
    labelEl.addEventListener('click', toggle);
    
    container.appendChild(labelContainer);
    container.appendChild(toggleWrapper);
    
    // Store reference for external access
    container._getState = () => input.checked;
    container._setState = (state) => {
        input.checked = state;
        slider.style.background = state ? 'var(--accent)' : 'var(--bg-input)';
        knob.style.left = state ? '23px' : '3px';
    };
    
    return container;
}

/**
 * Create a group of toggle switches
 * @param {Array<Object>} toggles - Array of toggle configurations
 * @param {string} title - Optional group title
 * @returns {HTMLElement} Toggle group container
 */
function createToggleGroup(toggles, title = '') {
    const group = document.createElement('div');
    group.className = 'toggle-group';
    group.style.cssText = `
        background: var(--bg-card);
        border: 1px solid var(--border-dim);
        border-radius: var(--radius-lg);
        padding: 20px;
    `;
    
    if (title) {
        const titleEl = document.createElement('h4');
        titleEl.style.cssText = `
            color: var(--text-primary);
            font-size: 1rem;
            font-weight: 600;
            margin-bottom: 16px;
        `;
        titleEl.textContent = title;
        group.appendChild(titleEl);
    }
    
    toggles.forEach((config, index) => {
        const toggle = createToggle(config);
        group.appendChild(toggle);
        
        // Add separator except for last item
        if (index < toggles.length - 1) {
            const separator = document.createElement('div');
            separator.style.cssText = `
                height: 1px;
                background: var(--border-dim);
                margin: 0;
            `;
            group.appendChild(separator);
        }
    });
    
    return group;
}

// Export to global scope
window.createToggle = createToggle;
window.createToggleGroup = createToggleGroup;
