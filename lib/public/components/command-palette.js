/**
 * Command Palette UI for Gravity Claw Dashboard
 * Keyboard shortcut: Cmd+K or Ctrl+K
 * Features: Fuzzy search, command history, keyboard navigation, async operations
 */

class CommandPalette {
  constructor() {
    this.isOpen = false;
    this.selectedIndex = 0;
    this.filteredCommands = [];
    this.searchQuery = '';
    this.commandHistory = this.loadCommandHistory();
    this.currentLoadingCommand = null;

    // Define all available commands
    this.allCommands = [
      // Navigation Commands
      {
        id: 'nav-chat',
        name: 'Go to Chat',
        category: 'Navigation',
        icon: '💬',
        handler: () => this.navigateToChat(),
        description: 'Open the chat interface'
      },
      {
        id: 'nav-dashboard',
        name: 'Go to Dashboard',
        category: 'Navigation',
        icon: '📊',
        handler: () => this.navigateToDashboard(),
        description: 'Open the analytics dashboard'
      },
      {
        id: 'nav-memory',
        name: 'Go to Memory',
        category: 'Navigation',
        icon: '🧠',
        handler: () => this.navigateToMemory(),
        description: 'View knowledge graph and facts'
      },
      {
        id: 'nav-tools',
        name: 'Go to Tools',
        category: 'Navigation',
        icon: '🔧',
        handler: () => this.navigateToTools(),
        description: 'Manage tools and plugins'
      },
      {
        id: 'nav-scheduler',
        name: 'Go to Scheduler',
        category: 'Navigation',
        icon: '⏱️',
        handler: () => this.navigateToScheduler(),
        description: 'Schedule and manage tasks'
      },

      // Settings Commands
      {
        id: 'settings-voice',
        name: 'Toggle Voice Mode',
        category: 'Settings',
        icon: '🎤',
        handler: () => this.toggleVoiceMode(),
        description: 'Enable/disable voice input and output'
      },
      {
        id: 'settings-tts',
        name: 'Change TTS Provider',
        category: 'Settings',
        icon: '🔊',
        handler: () => this.changeTTSProvider(),
        description: 'Select text-to-speech provider'
      },
      {
        id: 'settings-notifications',
        name: 'Toggle Notifications',
        category: 'Settings',
        icon: '🔔',
        handler: () => this.toggleNotifications(),
        description: 'Enable/disable notifications'
      },
      {
        id: 'settings-open',
        name: 'Open Settings',
        category: 'Settings',
        icon: '⚙️',
        handler: () => this.openSettings(),
        description: 'Open full settings panel'
      },

      // Dashboard Commands
      {
        id: 'dashboard-refresh',
        name: 'Refresh Dashboard',
        category: 'Dashboard',
        icon: '🔄',
        handler: () => this.refreshDashboard(),
        description: 'Reload all dashboard data',
        isAsync: true
      },
      {
        id: 'dashboard-export',
        name: 'Export Data',
        category: 'Dashboard',
        icon: '📥',
        handler: () => this.exportData(),
        description: 'Export dashboard data as JSON/CSV',
        isAsync: true
      },
      {
        id: 'dashboard-clear-cache',
        name: 'Clear Cache',
        category: 'Dashboard',
        icon: '🗑️',
        handler: () => this.clearCache(),
        description: 'Clear browser cache and localStorage',
        isAsync: true
      },

      // System Commands
      {
        id: 'system-help',
        name: 'Show Help',
        category: 'System',
        icon: '❓',
        handler: () => this.showHelp(),
        description: 'Display help and documentation'
      },
      {
        id: 'system-shortcuts',
        name: 'Show Shortcuts',
        category: 'System',
        icon: '⌨️',
        handler: () => this.showShortcuts(),
        description: 'View keyboard shortcuts cheat sheet'
      },
      {
        id: 'system-bug',
        name: 'Report Bug',
        category: 'System',
        icon: '🐛',
        handler: () => this.reportBug(),
        description: 'Open bug report form'
      },
      {
        id: 'system-theme',
        name: 'Toggle Dark Mode',
        category: 'System',
        icon: '🌙',
        handler: () => this.toggleDarkMode(),
        description: 'Switch between light and dark theme'
      }
    ];

    this.setupKeyboardListener();
  }

  /**
   * Setup global keyboard listener for Cmd+K / Ctrl+K
   */
  setupKeyboardListener() {
    document.addEventListener('keydown', (e) => {
      // Cmd+K (Mac) or Ctrl+K (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        this.toggle();
      }

      // Handle navigation within palette
      if (this.isOpen) {
        switch (e.key) {
          case 'ArrowUp':
            e.preventDefault();
            this.selectPrevious();
            break;
          case 'ArrowDown':
            e.preventDefault();
            this.selectNext();
            break;
          case 'Enter':
            e.preventDefault();
            this.executeSelected();
            break;
          case 'Escape':
            e.preventDefault();
            this.close();
            break;
        }
      }
    });
  }

  /**
   * Simple fuzzy search algorithm
   * Matches characters in order, scores by position and consecutiveness
   */
  fuzzySearch(query, commands) {
    if (!query) return commands;

    const queryLower = query.toLowerCase();
    const scored = commands
      .map((cmd) => {
        const nameLower = cmd.name.toLowerCase();
        const descriptionLower = cmd.description.toLowerCase();

        // Try matching against name first
        let score = this.calculateScore(queryLower, nameLower);

        // Boost score for commands that start with query
        if (nameLower.startsWith(queryLower)) {
          score += 100;
        }

        // Also check description for matches
        const descScore = this.calculateScore(queryLower, descriptionLower);
        if (descScore > 0) {
          score += descScore * 0.5;
        }

        return { cmd, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ cmd }) => cmd);

    return scored;
  }

  /**
   * Calculate match score for fuzzy search
   */
  calculateScore(query, text) {
    let score = 0;
    let queryIdx = 0;
    let lastMatchIdx = -1;

    for (let i = 0; i < text.length && queryIdx < query.length; i++) {
      if (text[i] === query[queryIdx]) {
        const distance = i - lastMatchIdx;
        score += distance === 1 ? 10 : 1;
        lastMatchIdx = i;
        queryIdx++;
      }
    }

    return queryIdx === query.length ? score : 0;
  }

  /**
   * Create and render the command palette DOM
   */
  createPaletteDOM() {
    const existingPalette = document.getElementById('command-palette-root');
    if (existingPalette) {
      return existingPalette;
    }

    const root = document.createElement('div');
    root.id = 'command-palette-root';
    root.innerHTML = `
      <div class="command-palette-overlay" id="cmd-overlay"></div>
      <div class="command-palette-modal" id="cmd-modal">
        <div class="command-palette-header">
          <div class="command-palette-search-wrapper">
            <span class="cmd-icon">⌘</span>
            <input
              type="text"
              id="cmd-search"
              class="command-palette-search"
              placeholder="Search commands..."
              autocomplete="off"
            />
            <span class="cmd-hint">ESC to close</span>
          </div>
        </div>

        <div class="command-palette-content">
          <div class="command-list" id="cmd-list">
            <!-- Commands rendered here -->
          </div>
          <div class="command-palette-empty" id="cmd-empty" style="display: none;">
            <p>No commands found</p>
            <p class="empty-hint">Try searching for something else</p>
          </div>
        </div>

        <div class="command-palette-footer">
          <span class="footer-hint">↑↓ Navigate • ⏎ Execute • ESC Close</span>
        </div>
      </div>
    `;

    document.body.appendChild(root);
    return root;
  }

  /**
   * Render command list
   */
  renderCommands() {
    const cmdList = document.getElementById('cmd-list');
    const emptyState = document.getElementById('cmd-empty');

    if (this.filteredCommands.length === 0) {
      cmdList.style.display = 'none';
      emptyState.style.display = 'block';
      return;
    }

    cmdList.style.display = 'block';
    emptyState.style.display = 'none';
    cmdList.innerHTML = '';

    this.filteredCommands.slice(0, 10).forEach((cmd, index) => {
      const item = document.createElement('div');
      item.className = `command-item ${index === this.selectedIndex ? 'selected' : ''}`;
      item.dataset.index = index;
      item.dataset.cmdId = cmd.id;

      const isLoading = this.currentLoadingCommand === cmd.id;

      item.innerHTML = `
        <div class="command-item-left">
          <span class="command-icon">${cmd.icon}</span>
          <div class="command-info">
            <div class="command-name">${this.highlightQuery(cmd.name)}</div>
            <div class="command-description">${cmd.description}</div>
          </div>
        </div>
        <div class="command-item-right">
          ${isLoading ? '<span class="command-spinner">⏳</span>' : ''}
          <span class="command-category">${cmd.category}</span>
        </div>
      `;

      item.addEventListener('click', () => {
        this.selectedIndex = index;
        this.executeSelected();
      });

      item.addEventListener('mouseenter', () => {
        this.selectedIndex = index;
        this.updateSelection();
      });

      cmdList.appendChild(item);
    });

    // Scroll to selected item
    this.scrollToSelected();
  }

  /**
   * Highlight matching characters in command name
   */
  highlightQuery(text) {
    if (!this.searchQuery) return text;

    const query = this.searchQuery.toLowerCase();
    let highlighted = text;
    let offset = 0;

    for (let char of query) {
      const idx = highlighted.toLowerCase().indexOf(char, offset);
      if (idx !== -1) {
        const before = highlighted.substring(0, idx);
        const match = highlighted.substring(idx, idx + 1);
        const after = highlighted.substring(idx + 1);
        highlighted = `${before}<mark>${match}</mark>${after}`;
        offset = idx + 32; // Approx length of <mark></mark> tags
      }
    }

    return highlighted;
  }

  /**
   * Update command list based on search query
   */
  updateFilter() {
    const searchInput = document.getElementById('cmd-search');
    this.searchQuery = searchInput.value;
    this.filteredCommands = this.fuzzySearch(
      this.searchQuery,
      this.allCommands
    );
    this.selectedIndex = 0;
    this.renderCommands();
  }

  /**
   * Select next command
   */
  selectNext() {
    if (this.filteredCommands.length === 0) return;
    this.selectedIndex = (this.selectedIndex + 1) % Math.min(this.filteredCommands.length, 10);
    this.updateSelection();
  }

  /**
   * Select previous command
   */
  selectPrevious() {
    if (this.filteredCommands.length === 0) return;
    const maxVisible = Math.min(this.filteredCommands.length, 10);
    this.selectedIndex = (this.selectedIndex - 1 + maxVisible) % maxVisible;
    this.updateSelection();
  }

  /**
   * Update visual selection
   */
  updateSelection() {
    const items = document.querySelectorAll('.command-item');
    items.forEach((item, index) => {
      if (index === this.selectedIndex) {
        item.classList.add('selected');
      } else {
        item.classList.remove('selected');
      }
    });
    this.scrollToSelected();
  }

  /**
   * Scroll selected item into view
   */
  scrollToSelected() {
    const selectedItem = document.querySelector('.command-item.selected');
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  /**
   * Execute selected command
   */
  async executeSelected() {
    if (this.selectedIndex >= this.filteredCommands.length) return;

    const command = this.filteredCommands[this.selectedIndex];
    await this.executeCommand(command);
  }

  /**
   * Execute a command
   */
  async executeCommand(command) {
    try {
      // Add to history
      this.addToHistory(command);

      // Show loading state for async commands
      if (command.isAsync) {
        this.currentLoadingCommand = command.id;
        this.renderCommands();
      }

      // Execute the handler
      const result = await command.handler();

      // Show success toast
      this.showToast(`✓ ${command.name}`, 'success');

      // Clear loading state
      this.currentLoadingCommand = null;

      // Close palette after short delay
      setTimeout(() => this.close(), 300);
    } catch (error) {
      console.error(`Command execution error: ${command.name}`, error);
      this.showToast(`✗ Failed: ${command.name}`, 'error');
      this.currentLoadingCommand = null;
      this.renderCommands();
    }
  }

  /**
   * Add command to history
   */
  addToHistory(command) {
    const history = this.commandHistory;
    const idx = history.findIndex((h) => h.id === command.id);

    if (idx !== -1) {
      history.splice(idx, 1);
    }

    history.unshift({ id: command.id, name: command.name, timestamp: Date.now() });
    this.commandHistory = history.slice(0, 10); // Keep last 10
    this.saveCommandHistory();
  }

  /**
   * Load command history from localStorage
   */
  loadCommandHistory() {
    try {
      const stored = localStorage.getItem('cmd-palette-history');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  /**
   * Save command history to localStorage
   */
  saveCommandHistory() {
    try {
      localStorage.setItem('cmd-palette-history', JSON.stringify(this.commandHistory));
    } catch {
      console.warn('Failed to save command history');
    }
  }

  /**
   * Show toast notification
   */
  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `command-toast command-toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  /**
   * Toggle palette open/closed
   */
  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  /**
   * Open the command palette
   */
  open() {
    if (this.isOpen) return;

    this.isOpen = true;
    const root = this.createPaletteDOM();

    // Setup event listeners
    const searchInput = document.getElementById('cmd-search');
    const overlay = document.getElementById('cmd-overlay');

    searchInput.addEventListener('input', () => this.updateFilter());
    overlay.addEventListener('click', () => this.close());

    // Initial render
    this.filteredCommands = this.allCommands;
    this.selectedIndex = 0;
    this.renderCommands();

    // Show and focus
    root.classList.add('open');
    searchInput.focus();
  }

  /**
   * Close the command palette
   */
  close() {
    if (!this.isOpen) return;

    this.isOpen = false;
    const root = document.getElementById('command-palette-root');

    if (root) {
      root.classList.remove('open');
      setTimeout(() => {
        this.searchQuery = '';
        this.selectedIndex = 0;
      }, 300);
    }
  }

  // ========== Command Handlers ==========

  navigateToChat() {
    window.location.hash = '#chat';
    this.showToast('📄 Loading chat...');
  }

  navigateToDashboard() {
    window.location.hash = '#dashboard';
    this.showToast('📊 Loading dashboard...');
  }

  navigateToMemory() {
    window.location.hash = '#memory';
    this.showToast('🧠 Loading memory graph...');
  }

  navigateToTools() {
    window.location.hash = '#tools';
    this.showToast('🔧 Loading tools...');
  }

  navigateToScheduler() {
    window.location.hash = '#scheduler';
    this.showToast('⏱️ Loading scheduler...');
  }

  toggleVoiceMode() {
    const isEnabled = localStorage.getItem('voice-mode') === 'true';
    localStorage.setItem('voice-mode', String(!isEnabled));
    const newState = !isEnabled ? 'enabled' : 'disabled';
    this.showToast(`Voice mode ${newState}`);
  }

  changeTTSProvider() {
    const providers = ['elevenlabs', 'google', 'azure', 'openai'];
    const current = localStorage.getItem('tts-provider') || 'elevenlabs';
    const idx = providers.indexOf(current);
    const next = providers[(idx + 1) % providers.length];
    localStorage.setItem('tts-provider', next);
    this.showToast(`TTS provider: ${next}`);
  }

  toggleNotifications() {
    const isEnabled = localStorage.getItem('notifications') !== 'false';
    localStorage.setItem('notifications', String(!isEnabled));
    const newState = !isEnabled ? 'disabled' : 'enabled';
    this.showToast(`Notifications ${newState}`);
  }

  openSettings() {
    window.location.hash = '#settings';
    this.showToast('⚙️ Opening settings...');
  }

  async refreshDashboard() {
    // Call dashboard refresh function if available
    if (window.dashboardAPI && window.dashboardAPI.refresh) {
      await window.dashboardAPI.refresh();
    }
    return 'Dashboard refreshed';
  }

  async exportData() {
    // Simple JSON export
    const data = {
      exported: new Date().toISOString(),
      sessionId: localStorage.getItem('session-id') || 'unknown',
      settings: {
        voiceMode: localStorage.getItem('voice-mode'),
        ttsProvider: localStorage.getItem('tts-provider'),
        notifications: localStorage.getItem('notifications'),
      },
      commandHistory: this.commandHistory,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gravity-claw-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async clearCache() {
    // Clear localStorage and indexedDB
    const keysToKeep = ['session-id', 'voice-mode', 'tts-provider'];
    const allKeys = Object.keys(localStorage);

    allKeys.forEach((key) => {
      if (!keysToKeep.includes(key)) {
        localStorage.removeItem(key);
      }
    });

    // Clear IndexedDB if used
    if ('indexedDB' in window) {
      const dbs = await indexedDB.databases?.();
      if (dbs) {
        for (const db of dbs) {
          indexedDB.deleteDatabase(db.name);
        }
      }
    }

    return 'Cache cleared successfully';
  }

  showHelp() {
    const helpHtml = `
      <div style="padding: 20px; font-size: 14px; line-height: 1.6;">
        <h3>Gravity Claw Help</h3>
        <p><strong>Command Palette:</strong> Press Cmd+K (Mac) or Ctrl+K (Windows/Linux)</p>
        <p><strong>Navigation:</strong> Use arrow keys, type to search, press Enter to execute</p>
        <p><strong>Keyboard Shortcuts:</strong> Press Cmd/Ctrl+Shift+? to view all shortcuts</p>
        <p style="margin-top: 20px; font-size: 12px; color: #999;">More help available in Documentation</p>
      </div>
    `;
    this.showModal('Help', helpHtml);
  }

  showShortcuts() {
    const shortcuts = `
      <div style="padding: 20px; font-size: 13px; line-height: 1.8;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #333;"><strong>Cmd/Ctrl+K</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #333;">Open Command Palette</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #333;"><strong>↑↓</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #333;">Navigate commands</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #333;"><strong>Enter</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #333;">Execute command</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #333;"><strong>ESC</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #333;">Close palette</td>
          </tr>
          <tr>
            <td style="padding: 8px;"><strong>Type</strong></td>
            <td style="padding: 8px;">Fuzzy search commands</td>
          </tr>
        </table>
      </div>
    `;
    this.showModal('Keyboard Shortcuts', shortcuts);
  }

  reportBug() {
    const bugForm = `
      <div style="padding: 20px;">
        <textarea
          id="bug-report"
          placeholder="Describe the bug..."
          style="width: 100%; height: 120px; padding: 10px; border: 1px solid #444; border-radius: 4px; background: #1a1a1a; color: #fff; font-family: monospace; font-size: 12px; resize: vertical;"
        ></textarea>
        <button
          onclick="CommandPalette.instance.submitBugReport()"
          style="margin-top: 10px; padding: 8px 16px; background: #007acc; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;"
        >
          Submit Report
        </button>
      </div>
    `;
    this.showModal('Report Bug', bugForm);
  }

  submitBugReport() {
    const textarea = document.getElementById('bug-report');
    if (textarea && textarea.value.trim()) {
      console.log('Bug report:', textarea.value);
      this.showToast('✓ Bug report submitted', 'success');
      this.closeModal();
    } else {
      this.showToast('✗ Please describe the bug', 'error');
    }
  }

  toggleDarkMode() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const newTheme = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    this.showToast(`Theme: ${newTheme}`);
  }

  showModal(title, content) {
    const modal = document.createElement('div');
    modal.className = 'command-modal';
    modal.innerHTML = `
      <div class="command-modal-overlay"></div>
      <div class="command-modal-content">
        <div class="command-modal-header">
          <h2>${title}</h2>
          <button class="command-modal-close" onclick="this.closest('.command-modal').remove()">✕</button>
        </div>
        <div class="command-modal-body">
          ${content}
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.style.display = 'flex';
  }

  closeModal() {
    const modal = document.querySelector('.command-modal');
    if (modal) modal.remove();
  }

  static instance = null;

  static getInstance() {
    if (!CommandPalette.instance) {
      CommandPalette.instance = new CommandPalette();
    }
    return CommandPalette.instance;
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    CommandPalette.getInstance();
  });
} else {
  CommandPalette.getInstance();
}
