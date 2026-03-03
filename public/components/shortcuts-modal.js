// ========================================
// Keyboard Shortcuts Modal Component
// Shows all available keyboard shortcuts
// ========================================

/**
 * Create and show keyboard shortcuts modal
 */
function showShortcutsModal() {
    const shortcuts = [
        {
            category: 'Navigation',
            items: [
                { keys: ['Cmd', ','], description: 'Open Settings' },
                { keys: ['Cmd', 'Shift', 'A'], description: 'Open Analytics' },
                { keys: ['Cmd', 'K'], description: 'Command Palette (coming soon)' },
                { keys: ['Cmd', '/'], description: 'Show Shortcuts' }
            ]
        },
        {
            category: 'Chat',
            items: [
                { keys: ['Shift', 'Enter'], description: 'New Line' },
                { keys: ['Enter'], description: 'Send Message' },
                { keys: ['Esc'], description: 'Clear Input' }
            ]
        },
        {
            category: 'UI Controls',
            items: [
                { keys: ['Esc'], description: 'Close Modal/Dialog' },
                { keys: ['Tab'], description: 'Navigate Fields' },
                { keys: ['Shift', 'Tab'], description: 'Navigate Backwards' }
            ]
        },
        {
            category: 'Theme',
            items: [
                { keys: ['Click Theme Icon'], description: 'Toggle Light/Dark Mode' }
            ]
        }
    ];

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content shortcuts-modal" role="dialog" aria-labelledby="shortcuts-title" aria-modal="true">
            <div class="modal-header">
                <h2 id="shortcuts-title">Keyboard Shortcuts</h2>
                <button class="modal-close" aria-label="Close shortcuts">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
            <div class="modal-body">
                ${shortcuts.map(category => `
                    <div class="shortcut-category">
                        <h3 class="shortcut-category-title">${category.category}</h3>
                        <div class="shortcut-list">
                            ${category.items.map(item => `
                                <div class="shortcut-item">
                                    <div class="shortcut-keys">
                                        ${item.keys.map(key => `<kbd>${key}</kbd>`).join('<span class="shortcut-plus">+</span>')}
                                    </div>
                                    <div class="shortcut-description">${item.description}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
            <div class="modal-footer">
                <p style="color: var(--text-muted); font-size: 0.875rem;">
                    💡 Tip: Most Cmd shortcuts work with Ctrl on Windows/Linux
                </p>
            </div>
        </div>
    `;

    // Close on overlay click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeShortcutsModal(modal);
        }
    });

    // Close on close button click
    const closeBtn = modal.querySelector('.modal-close');
    closeBtn.addEventListener('click', () => closeShortcutsModal(modal));

    // Close on Escape key
    const escapeHandler = (e) => {
        if (e.key === 'Escape') {
            closeShortcutsModal(modal);
            document.removeEventListener('keydown', escapeHandler);
        }
    };
    document.addEventListener('keydown', escapeHandler);

    document.body.appendChild(modal);

    // Focus trap
    const focusableElements = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    firstFocusable?.focus();

    modal.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            if (e.shiftKey) {
                if (document.activeElement === firstFocusable) {
                    e.preventDefault();
                    lastFocusable?.focus();
                }
            } else {
                if (document.activeElement === lastFocusable) {
                    e.preventDefault();
                    firstFocusable?.focus();
                }
            }
        }
    });
}

/**
 * Close shortcuts modal
 */
function closeShortcutsModal(modal) {
    modal.style.animation = 'fadeOut 0.2s ease-out';
    setTimeout(() => modal.remove(), 200);
}

// Export to global scope
window.showShortcutsModal = showShortcutsModal;

// Add styles for shortcuts modal
(() => {
  const style = document.createElement('style');
  style.textContent = `
      .shortcuts-modal {
          max-width: 700px;
          width: 90%;
          max-height: 90vh;
          overflow-y: auto;
      }

      .shortcut-category {
          margin-bottom: 32px;
      }

      .shortcut-category:last-child {
          margin-bottom: 0;
      }

      .shortcut-category-title {
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 16px;
      }

      .shortcut-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
      }

      .shortcut-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          background: var(--bg-card);
          border: 1px solid var(--border-dim);
          border-radius: var(--radius-md);
          transition: all var(--transition-fast);
      }

      .shortcut-item:hover {
          background: var(--bg-hover);
          border-color: var(--border-bright);
      }

      .shortcut-keys {
          display: flex;
          align-items: center;
          gap: 6px;
      }

      .shortcut-keys kbd {
          display: inline-block;
          padding: 4px 10px;
          font-family: var(--font-mono);
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-primary);
          background: var(--bg-input);
          border: 1px solid var(--border-dim);
          border-radius: 6px;
          box-shadow: 0 2px 0 var(--border-dim);
          min-width: 32px;
          text-align: center;
      }

      .shortcut-plus {
          color: var(--text-muted);
          font-size: 0.75rem;
      }

      .shortcut-description {
          color: var(--text-secondary);
          font-size: 0.9rem;
          text-align: right;
      }

      @media (max-width: 768px) {
          .shortcuts-modal {
              width: 95%;
          }

          .shortcut-item {
              flex-direction: column;
              align-items: flex-start;
              gap: 8px;
          }

          .shortcut-description {
              text-align: left;
          }
      }

      @keyframes fadeOut {
          from {
              opacity: 1;
          }
          to {
              opacity: 0;
          }
      }

      /* Light theme overrides */
      [data-theme="light"] .shortcut-keys kbd {
          background: #f3f4f6;
          border-color: #d1d5db;
          box-shadow: 0 2px 0 #d1d5db;
      }
  `;
  document.head.appendChild(style);
})();
