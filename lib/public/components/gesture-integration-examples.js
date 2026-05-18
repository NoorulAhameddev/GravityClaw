/**
 * ═════════════════════════════════════════════════════════════════════════════
 * Touch Gestures Integration Examples
 * ═════════════════════════════════════════════════════════════════════════════
 * 
 * Examples of how to integrate touch gestures with various dashboard pages
 * and functionality. Copy patterns into your app.js or page-specific files.
 */

// ═════════════════════════════════════════════════════════════════════════════
// 1. Initialize Touch Gestures (Already in index.html)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Basic initialization (ALREADY DONE IN index.html)
 */
function initializeGestureManager() {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      // Initialize with options
      const gestureManager = TouchGestureManager.init({
        enableLogging: false,  // Set to true for debugging
      });

      // Store reference globally for access
      window._gestureManager = gestureManager;

      if (gestureManager.isSupported()) {
        console.log('✓ Touch gestures enabled for this device');
        console.log('Preferences:', gestureManager.getPreferences());
      } else {
        console.log('ℹ Touch not supported; using keyboard fallback');
      }

      // Make sure essential elements are marked as long-pressable
      setupLongPressableElements();
    }, 100);
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. Make Elements Long-Pressable
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Mark elements as long-pressable for context menu
 */
function setupLongPressableElements() {
  const observer = new MutationObserver(() => {
    // Memory facts
    document.querySelectorAll('.memory-fact:not([data-long-pressable])').forEach(el => {
      el.setAttribute('data-long-pressable', '');
    });

    // Chat messages
    document.querySelectorAll('.message:not([data-long-pressable])').forEach(el => {
      el.setAttribute('data-long-pressable', '');
    });

    // Generic data items
    document.querySelectorAll('[data-item]:not([data-long-pressable])').forEach(el => {
      el.setAttribute('data-long-pressable', '');
    });

    // Chart containers (for zoom)
    document.querySelectorAll('.chart-container:not([data-chart-zoomable])').forEach(el => {
      el.setAttribute('data-chart-zoomable', '');
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Initial setup
  setupLongPressableElements.call(observer);
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. Handle Context Menu Actions
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Listen for context menu actions on long-pressed items
 */
function setupContextMenuHandlers() {
  document.addEventListener('contextmenu-action', async (e) => {
    const { action, element } = e.detail;
    const itemId = element.dataset.id;
    const itemText = element.textContent || element.innerText || '';

    try {
      switch (action) {
        case 'copy':
          // Already handled by touch-gestures.js
          console.log('Copied:', itemText.substring(0, 30));
          break;

        case 'edit':
          handleEditItem(element, itemId);
          break;

        case 'delete':
          await handleDeleteItem(element, itemId);
          break;

        case 'share':
          console.log('Sharing:', itemText);
          break;
      }
    } catch (error) {
      console.error('Context menu action error:', error);
    }
  });
}

/**
 * Example: Handle edit action
 */
async function handleEditItem(element, itemId) {
  if (element.classList.contains('memory-fact')) {
    // Show edit modal for memory fact
    const currentText = element.textContent;
    const newText = prompt('Edit memory fact:', currentText);
    if (newText) {
      try {
        await fetch(`/api/memory/${itemId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fact: newText }),
        });
        element.textContent = newText;
      } catch (error) {
        console.error('Failed to update memory:', error);
      }
    }
  }
}

/**
 * Example: Handle delete action
 */
async function handleDeleteItem(element, itemId) {
  if (!confirm('Delete this item?')) return;

  try {
    await fetch(`/api/items/${itemId}`, { method: 'DELETE' });
    
    // Animate removal
    element.style.opacity = '0';
    element.style.transform = 'translateX(-20px)';
    setTimeout(() => {
      element.remove();
    }, 300);
  } catch (error) {
    console.error('Failed to delete item:', error);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. Add Swipe Navigation Handler
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Enhanced swipe navigation with visual feedback
 */
function setupSwipeNavigation() {
  const originalNavigate = window.navigate;

  window.navigate = function(page) {
    // Call original navigate function
    originalNavigate.call(window, page);

    // Add visual feedback
    const pageEl = document.getElementById(`page-${page}`);
    if (pageEl) {
      pageEl.style.animation = 'none';
      setTimeout(() => {
        pageEl.style.animation = 'slideIn 0.3s ease-out';
      }, 10);
    }

    // Log navigation
    console.debug(`→ Navigated to: ${page}`);
  };

  // Add slide-in animation if not exists
  if (!document.getElementById('navigation-animation')) {
    const style = document.createElement('style');
    style.id = 'navigation-animation';
    style.textContent = `
      @keyframes slideIn {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      
      .page.active {
        animation: slideIn 0.3s ease-out;
      }
    `;
    document.head.appendChild(style);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 5. Pull-to-Refresh Integration
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Setup pull-to-refresh for each page
 * This is automatically called by touch-gestures.js but can be customized
 */
function setupPageRefresh() {
  // Dashboard refresh
  const originalLoadDashboard = window.loadDashboard;
  window.loadDashboard = async function() {
    console.debug('Refreshing dashboard...');
    try {
      // Call original function
      if (originalLoadDashboard) {
        await originalLoadDashboard.call(window);
      }
      // Show success feedback
      window._gestureManager?.showNotification('Dashboard refreshed ✓');
    } catch (error) {
      console.error('Dashboard refresh error:', error);
      window._gestureManager?.showNotification('Refresh failed');
    }
  };

  // Memory refresh
  const originalLoadMemory = window.loadMemory;
  window.loadMemory = async function() {
    console.debug('Refreshing memory...');
    try {
      if (originalLoadMemory) {
        await originalLoadMemory.call(window);
      }
      window._gestureManager?.showNotification('Memory refreshed ✓');
    } catch (error) {
      console.error('Memory refresh error:', error);
      window._gestureManager?.showNotification('Refresh failed');
    }
  };

  // Tools refresh
  const originalLoadTools = window.loadTools;
  window.loadTools = async function() {
    console.debug('Refreshing tools...');
    try {
      if (originalLoadTools) {
        await originalLoadTools.call(window);
      }
      window._gestureManager?.showNotification('Tools refreshed ✓');
    } catch (error) {
      console.error('Tools refresh error:', error);
      window._gestureManager?.showNotification('Refresh failed');
    }
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 6. Add Gesture Settings to Dashboard
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Add gesture settings UI to settings page or dashboard
 */
function setupGestureSettingsUI() {
  // Check if gesture settings UI should be added
  const settingsContainer = document.getElementById('gesture-settings-panel');
  if (!settingsContainer) return;

  // Load settings component
  const script = document.createElement('script');
  script.src = '/components/gesture-settings.js';
  script.onload = () => {
    const settingsPanel = new GestureSettingsPanel();
    settingsPanel.mount('#gesture-settings-panel');
  };
  document.head.appendChild(script);
}

// ═════════════════════════════════════════════════════════════════════════════
// 7. Mobile Detection & Optimization
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Detect device type and optimize UI
 */
function detectAndOptimizeMobile() {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isTablet = /iPad|Android(?!.*Mobi)/i.test(navigator.userAgent);
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  document.documentElement.classList.toggle('is-mobile', isMobile);
  document.documentElement.classList.toggle('is-tablet', isTablet);
  document.documentElement.classList.toggle('has-touch', hasTouch);

  return { isMobile, isTablet, hasTouch };
}

// ═════════════════════════════════════════════════════════════════════════════
// 8. Gesture Preference Management
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Get and manage gesture preferences
 */
const GestureAPI = {
  /**
   * Get all preferences
   */
  getPreferences() {
    return window._gestureManager?.getPreferences() || {};
  },

  /**
   * Update a preference
   */
  setPreference(key, value) {
    window._gestureManager?.setPreference(key, value);
  },

  /**
   * Check if a gesture is enabled
   */
  isEnabled(gestureName) {
    const prefs = this.getPreferences();
    const key = `${gestureName}Enabled`;
    return prefs[key] !== false;
  },

  /**
   * Enable/disable gesture
   */
  setEnabled(gestureName, enabled) {
    const key = `${gestureName}Enabled`;
    this.setPreference(key, enabled);
  },

  /**
   * Reset all preferences to defaults
   */
  resetAll() {
    window._gestureManager?.resetPreferences();
  },

  /**
   * Trigger haptic feedback
   */
  haptic(type = 'light') {
    const manager = window._gestureManager;
    if (!manager) return;

    if (type === 'light') manager.vibration?.light();
    else if (type === 'medium') manager.vibration?.medium();
    else if (type === 'strong') manager.vibration?.strong();
    else manager.vibration?.vibrate(type);
  },

  /**
   * Show toast notification
   */
  notify(message, duration = 2000) {
    window._gestureManager?.showNotification(message, duration);
  },

  /**
   * Check if touch is supported
   */
  isSupported() {
    return window._gestureManager?.isSupported() || false;
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// 9. Custom Swipe Handler Example
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Example: Custom swipe handling on specific elements
 */
function setupCustomSwipeHandlers() {
  // Handle swipe in settings modal
  const settingsModal = document.querySelector('.settings-modal');
  if (settingsModal) {
    let touchStartX = 0;

    settingsModal.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
    });

    settingsModal.addEventListener('touchend', (e) => {
      const touchEndX = e.changedTouches[0].clientX;
      const diff = touchEndX - touchStartX;

      if (Math.abs(diff) > 50) {
        if (diff < 0) {
          // Swiped left - next step
          settingsModal.dispatchEvent(new Event('next-step'));
        } else {
          // Swiped right - previous step
          settingsModal.dispatchEvent(new Event('prev-step'));
        }
      }
    });
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 10. Chart Pinch-Zoom Example
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Example: Make charts zoomable with pinch
 */
function setupChartZoom() {
  // Mark all chart containers as zoomable
  document.querySelectorAll('.chart-container, [data-chart]').forEach(el => {
    el.setAttribute('data-chart-zoomable', '');
    
    // Add CSS for smooth transitions
    el.style.transition = 'transform 0.3s ease-out';
    
    // Set initial scale
    el.style.transform = 'scale(1)';
  });

  // Listen for zoom changes
  const observer = new MutationObserver(() => {
    document.querySelectorAll('[data-chart-zoomable]:not([data-zoom-setup])').forEach(el => {
      el.setAttribute('data-zoom-setup', 'true');
      
      // Add zoom controls if desired
      const controls = document.createElement('div');
      controls.className = 'zoom-controls';
      controls.style.cssText = `
        position: absolute;
        top: 10px;
        right: 10px;
        display: flex;
        gap: 5px;
        z-index: 10;
      `;
      controls.innerHTML = `
        <button class="zoom-in" title="Zoom In" style="padding: 8px 12px; background: var(--accent); color: white; border: none; border-radius: 4px; cursor: pointer;">+</button>
        <button class="zoom-reset" title="Reset Zoom" style="padding: 8px 12px; background: var(--surface2); color: var(--text); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">↺</button>
        <button class="zoom-out" title="Zoom Out" style="padding: 8px 12px; background: var(--accent); color: white; border: none; border-radius: 4px; cursor: pointer;">−</button>
      `;
      
      el.parentElement.style.position = 'relative';
      el.parentElement.appendChild(controls);

      // Wire up buttons
      controls.querySelector('.zoom-in').onclick = () => {
        el.style.transform = 'scale(1.2)';
        GestureAPI.haptic('light');
      };
      controls.querySelector('.zoom-reset').onclick = () => {
        el.style.transform = 'scale(1)';
        GestureAPI.haptic('light');
      };
      controls.querySelector('.zoom-out').onclick = () => {
        el.style.transform = 'scale(0.8)';
        GestureAPI.haptic('light');
      };
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

// ═════════════════════════════════════════════════════════════════════════════
// 11. Initialization Bootstrap
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Call this at app startup to initialize all gesture features
 * NOTE: Most of this is already done in index.html
 */
function initializeAllGestures() {
  // Run after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAllGestures);
    return;
  }

  // Detect device
  const device = detectAndOptimizeMobile();
  console.debug('Device info:', device);

  // Setup all handlers
  setupContextMenuHandlers();
  setupSwipeNavigation();
  setupPageRefresh();
  setupGestureSettingsUI();
  setupCustomSwipeHandlers();
  setupChartZoom();

  console.log('✓ All gesture handlers initialized');
}

// ═════════════════════════════════════════════════════════════════════════════
// Export API
// ═════════════════════════════════════════════════════════════════════════════

// Make GestureAPI globally available
if (typeof window !== 'undefined') {
  window.GestureAPI = GestureAPI;
  window.initializeAllGestures = initializeAllGestures;
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    GestureAPI,
    initializeAllGestures,
    setupContextMenuHandlers,
    setupSwipeNavigation,
    setupPageRefresh,
    detectAndOptimizeMobile,
  };
}
