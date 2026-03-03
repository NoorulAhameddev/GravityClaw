// ========================================
// Modal Component
// Dialog/popup for confirmations and forms
// ========================================

/**
 * Create and show a modal dialog
 * @param {Object} options - Modal configuration
 * @param {string} options.title - Modal title
 * @param {string} options.content - Modal body content (HTML string)
 * @param {Array<Object>} options.actions - Action buttons {label, onClick, className}
 * @param {boolean} options.closeOnOverlay - Close when clicking outside (default: true)
 * @param {Function} options.onClose - Callback when modal closes
 * @returns {Object} Modal controller with show/hide methods
 */
function createModal(options = {}) {
    const {
        title = '',
        content = '',
        actions = [],
        closeOnOverlay = true,
        onClose = () => {}
    } = options;
    
    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        padding: 20px;
        animation: fadeIn 0.2s ease-out;
    `;
    
    // Create modal container
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.style.cssText = `
        background: var(--bg-card);
        border: 1px solid var(--border-dim);
        border-radius: var(--radius-lg);
        max-width: 500px;
        width: 100%;
        max-height: 80vh;
        overflow: hidden;
        box-shadow: var(--shadow-lg);
        animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    `;
    
    let html = '';
    
    // Modal header
    if (title) {
        html += `
            <div class="modal-header" style="
                padding: 24px;
                border-bottom: 1px solid var(--border-dim);
                display: flex;
                justify-content: space-between;
                align-items: center;
            ">
                <h3 style="
                    font-size: 1.25rem;
                    font-weight: 600;
                    color: var(--text-primary);
                    margin: 0;
                ">${title}</h3>
                <button class="modal-close" style="
                    background: transparent;
                    border: none;
                    color: var(--text-secondary);
                    cursor: pointer;
                    padding: 4px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: var(--radius-sm);
                    transition: all var(--transition-fast);
                " aria-label="Close modal">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        `;
    }
    
    // Modal body
    html += `
        <div class="modal-body" style="
            padding: 24px;
            overflow-y: auto;
            max-height: calc(80vh - 160px);
            color: var(--text-secondary);
            line-height: 1.6;
        ">
            ${content}
        </div>
    `;
    
    // Modal footer with actions
    if (actions.length > 0) {
        html += '<div class="modal-footer" style="padding: 16px 24px; border-top: 1px solid var(--border-dim); display: flex; gap: 12px; justify-content: flex-end;">';
        actions.forEach((action, index) => {
            const btnClass = action.className || '';
            const isPrimary = btnClass.includes('primary');
            html += `
                <button class="modal-action-btn ${btnClass}" data-action="${index}" style="
                    padding: 10px 20px;
                    background: ${isPrimary ? 'var(--accent)' : 'var(--bg-input)'};
                    border: 1px solid ${isPrimary ? 'var(--accent)' : 'var(--border-dim)'};
                    border-radius: var(--radius-md);
                    color: ${isPrimary ? 'white' : 'var(--text-primary)'};
                    font-family: var(--font-main);
                    font-size: 0.875rem;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all var(--transition-fast);
                ">
                    ${action.label}
                </button>
            `;
        });
        html += '</div>';
    }
    
    modal.innerHTML = html;
    overlay.appendChild(modal);
    
    // Close function
    const close = () => {
        overlay.style.animation = 'fadeOut 0.2s ease-out';
        modal.style.animation = 'slideDown 0.2s ease-out';
        setTimeout(() => {
            if (overlay.parentNode) {
                overlay.remove();
            }
            onClose();
        }, 200);
    };
    
    // Attach event handlers
    const closeBtn = modal.querySelector('.modal-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', close);
        closeBtn.addEventListener('mouseenter', (e) => {
            e.target.style.background = 'var(--bg-hover)';
        });
        closeBtn.addEventListener('mouseleave', (e) => {
            e.target.style.background = 'transparent';
        });
    }
    
    if (closeOnOverlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                close();
            }
        });
    }
    
    // Attach action handlers
    actions.forEach((action, index) => {
        const btn = modal.querySelector(`[data-action="${index}"]`);
        if (btn) {
            btn.addEventListener('click', () => {
                if (action.onClick) {
                    const result = action.onClick();
                    // Close modal unless action returns false
                    if (result !== false) {
                        close();
                    }
                } else {
                    close();
                }
            });
            
            // Hover effects
            btn.addEventListener('mouseenter', (e) => {
                const isPrimary = action.className?.includes('primary');
                e.target.style.background = isPrimary ? 'var(--accent-dark)' : 'var(--bg-hover)';
                e.target.style.transform = 'translateY(-1px)';
            });
            btn.addEventListener('mouseleave', (e) => {
                const isPrimary = action.className?.includes('primary');
                e.target.style.background = isPrimary ? 'var(--accent)' : 'var(--bg-input)';
                e.target.style.transform = 'translateY(0)';
            });
        }
    });
    
    // ESC key to close
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            close();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
    
    return {
        element: overlay,
        show: () => document.body.appendChild(overlay),
        close
    };
}

/**
 * Show a confirmation dialog
 * @param {string} message - Confirmation message
 * @param {Function} onConfirm - Callback when confirmed
 * @param {Function} onCancel - Callback when cancelled
 */
function showConfirmModal(message, onConfirm = () => {}, onCancel = () => {}) {
    const modal = createModal({
        title: 'Confirm Action',
        content: `<p>${message}</p>`,
        actions: [
            {
                label: 'Cancel',
                onClick: onCancel
            },
            {
                label: 'Confirm',
                className: 'primary',
                onClick: onConfirm
            }
        ]
    });
    
    modal.show();
    return modal;
}

/**
 * Show an alert dialog
 * @param {string} title - Alert title
 * @param {string} message - Alert message
 * @param {string} type - Alert type: 'info', 'success', 'warning', 'error'
 */
function showAlertModal(title, message, type = 'info') {
    const icons = {
        info: '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
        success: '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
        warning: '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
        error: '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--error)" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>'
    };
    
    const modal = createModal({
        title,
        content: `
            <div style="text-align: center;">
                <div style="margin-bottom: 16px;">
                    ${icons[type] || icons.info}
                </div>
                <p style="color: var(--text-primary); font-size: 1rem;">${message}</p>
            </div>
        `,
        actions: [
            {
                label: 'OK',
                className: 'primary'
            }
        ]
    });
    
    modal.show();
    return modal;
}

// Add animations to CSS
(() => {
  const style = document.createElement('style');
  style.textContent = `
      @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
      }
      
      @keyframes fadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
      }
      
      @keyframes slideUp {
          from {
              transform: translateY(20px);
              opacity: 0;
          }
          to {
              transform: translateY(0);
              opacity: 1;
          }
      }
      
      @keyframes slideDown {
          from {
              transform: translateY(0);
              opacity: 1;
          }
          to {
              transform: translateY(20px);
              opacity: 0;
          }
      }
  `;
  document.head.appendChild(style);
})();

// Export to global scope
window.createModal = createModal;
window.showConfirmModal = showConfirmModal;
window.showAlertModal = showAlertModal;
