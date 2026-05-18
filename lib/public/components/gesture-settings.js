/**
 * ═════════════════════════════════════════════════════════════════════════════
 * Gesture Settings UI Component
 * ═════════════════════════════════════════════════════════════════════════════
 * 
 * Provides UI for configuring touch gestures and preferences
 * Include in dashboard settings page
 */

class GestureSettingsPanel {
  constructor() {
    this.container = null;
  }

  create() {
    const panel = document.createElement('div');
    panel.id = 'gesture-settings-panel';
    panel.style.cssText = `
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 20px;
      max-width: 500px;
    `;

    const manager = TouchGestureManager.instance;
    if (!manager) {
      panel.innerHTML = '<p style="color: var(--muted);">Touch gestures not initialized</p>';
      return panel;
    }

    const prefs = manager.getPreferences();
    const html = `
      <div style="margin-bottom: 20px;">
        <h3 style="margin: 0 0 16px 0; color: var(--text);">Gesture Settings</h3>
        
        <!-- Swipe Navigation -->
        <div style="margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid var(--border);">
          <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; margin-bottom: 12px;">
            <input 
              type="checkbox" 
              id="swipe-enabled" 
              ${prefs.swipeEnabled ? 'checked' : ''} 
              style="cursor: pointer; width: 18px; height: 18px;"
            />
            <span>Swipe Navigation</span>
          </label>
          <p style="margin: 0; font-size: 12px; color: var(--muted);">
            Swipe left/right to navigate between pages
          </p>
          
          <div style="margin-top: 12px;">
            <label style="display: block; font-size: 12px; margin-bottom: 8px;">
              Sensitivity: <span id="sensitivity-value">${(prefs.swipeSensitivity || 1).toFixed(1)}x</span>
            </label>
            <input 
              type="range" 
              id="swipe-sensitivity" 
              min="0.5" 
              max="2" 
              step="0.1" 
              value="${prefs.swipeSensitivity || 1}" 
              style="width: 100%; cursor: pointer;"
            />
            <div style="display: flex; justify-content: space-between; font-size: 10px; color: var(--muted); margin-top: 4px;">
              <span>Less</span>
              <span>More</span>
            </div>
          </div>
        </div>

        <!-- Pull to Refresh -->
        <div style="margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid var(--border);">
          <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; margin-bottom: 8px;">
            <input 
              type="checkbox" 
              id="pull-to-refresh-enabled" 
              ${prefs.pullToRefreshEnabled ? 'checked' : ''} 
              style="cursor: pointer; width: 18px; height: 18px;"
            />
            <span>Pull to Refresh</span>
          </label>
          <p style="margin: 0; font-size: 12px; color: var(--muted);">
            Pull down from top to refresh current page
          </p>
        </div>

        <!-- Long Press -->
        <div style="margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid var(--border);">
          <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; margin-bottom: 8px;">
            <input 
              type="checkbox" 
              id="long-press-enabled" 
              ${prefs.longPressEnabled ? 'checked' : ''} 
              style="cursor: pointer; width: 18px; height: 18px;"
            />
            <span>Long Press Context Menu</span>
          </label>
          <p style="margin: 0; font-size: 12px; color: var(--muted);">
            Long press items to see context menu
          </p>
        </div>

        <!-- Pinch Zoom -->
        <div style="margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid var(--border);">
          <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; margin-bottom: 8px;">
            <input 
              type="checkbox" 
              id="pinch-zoom-enabled" 
              ${prefs.pinchZoomEnabled ? 'checked' : ''} 
              style="cursor: pointer; width: 18px; height: 18px;"
            />
            <span>Pinch to Zoom</span>
          </label>
          <p style="margin: 0; font-size: 12px; color: var(--muted);">
            Pinch gesture to zoom charts and content
          </p>
        </div>

        <!-- Haptic Feedback -->
        <div style="margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid var(--border);">
          <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; margin-bottom: 8px;">
            <input 
              type="checkbox" 
              id="haptic-enabled" 
              ${prefs.hapticFeedbackEnabled ? 'checked' : ''} 
              style="cursor: pointer; width: 18px; height: 18px;"
            />
            <span>Haptic Feedback</span>
          </label>
          <p style="margin: 0; font-size: 12px; color: var(--muted);">
            Vibration on gesture completion (if supported)
          </p>
          <button 
            id="test-haptic-btn" 
            style="
              margin-top: 8px;
              padding: 6px 12px;
              background: var(--accent);
              color: white;
              border: none;
              border-radius: 4px;
              cursor: pointer;
              font-size: 12px;
              transition: background 0.15s;
            "
          >
            Test Vibration
          </button>
        </div>

        <!-- Device Info -->
        <div style="margin-bottom: 16px;">
          <h4 style="margin: 0 0 8px 0; font-size: 12px; color: var(--muted); text-transform: uppercase;">
            Device Info
          </h4>
          <ul style="margin: 0; padding: 0; list-style: none; font-size: 12px; color: var(--muted);">
            <li>✓ Touch Supported: ${manager.isSupported() ? 'Yes' : 'No'}</li>
            <li>• Max Touch Points: ${navigator.maxTouchPoints || 'Unknown'}</li>
            <li>• User Agent: ${navigator.userAgent.substring(0, 40)}...</li>
          </ul>
        </div>

        <!-- Buttons -->
        <div style="display: flex; gap: 10px; margin-top: 20px;">
          <button 
            id="save-settings-btn" 
            style="
              flex: 1;
              padding: 10px;
              background: var(--accent);
              color: white;
              border: none;
              border-radius: 6px;
              cursor: pointer;
              font-weight: 500;
              transition: background 0.15s;
            "
          >
            Save Settings
          </button>
          <button 
            id="reset-settings-btn" 
            style="
              flex: 1;
              padding: 10px;
              background: var(--surface2);
              color: var(--text);
              border: 1px solid var(--border);
              border-radius: 6px;
              cursor: pointer;
              font-weight: 500;
              transition: all 0.15s;
            "
          >
            Reset
          </button>
        </div>
      </div>
    `;

    panel.innerHTML = html;
    this.attachEventListeners(panel, manager);
    return panel;
  }

  attachEventListeners(panel, manager) {
    // Swipe sensitivity slider
    const sensitivitySlider = panel.querySelector('#swipe-sensitivity');
    const sensitivityValue = panel.querySelector('#sensitivity-value');
    if (sensitivitySlider) {
      sensitivitySlider.addEventListener('input', (e) => {
        sensitivityValue.textContent = parseFloat(e.target.value).toFixed(1) + 'x';
      });
    }

    // Test haptic button
    const testHapticBtn = panel.querySelector('#test-haptic-btn');
    if (testHapticBtn) {
      testHapticBtn.addEventListener('click', () => {
        manager.vibration?.pattern([100, 50, 100]);
        testHapticBtn.style.background = 'var(--green)';
        setTimeout(() => {
          testHapticBtn.style.background = 'var(--accent)';
        }, 200);
      });
      testHapticBtn.addEventListener('mouseenter', () => {
        testHapticBtn.style.background = 'var(--accent-hover)';
      });
      testHapticBtn.addEventListener('mouseleave', () => {
        testHapticBtn.style.background = 'var(--accent)';
      });
    }

    // Save button
    const saveBtn = panel.querySelector('#save-settings-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        manager.setPreference('swipeEnabled', panel.querySelector('#swipe-enabled').checked);
        manager.setPreference('pullToRefreshEnabled', panel.querySelector('#pull-to-refresh-enabled').checked);
        manager.setPreference('longPressEnabled', panel.querySelector('#long-press-enabled').checked);
        manager.setPreference('pinchZoomEnabled', panel.querySelector('#pinch-zoom-enabled').checked);
        manager.setPreference('hapticFeedbackEnabled', panel.querySelector('#haptic-enabled').checked);
        manager.setPreference('swipeSensitivity', parseFloat(panel.querySelector('#swipe-sensitivity').value));

        saveBtn.textContent = '✓ Saved';
        saveBtn.style.background = 'var(--green)';
        setTimeout(() => {
          saveBtn.textContent = 'Save Settings';
          saveBtn.style.background = 'var(--accent)';
        }, 2000);
      });
      saveBtn.addEventListener('mouseenter', () => {
        if (saveBtn.textContent === 'Save Settings') {
          saveBtn.style.background = 'var(--accent-hover)';
        }
      });
      saveBtn.addEventListener('mouseleave', () => {
        if (saveBtn.textContent === 'Save Settings') {
          saveBtn.style.background = 'var(--accent)';
        }
      });
    }

    // Reset button
    const resetBtn = panel.querySelector('#reset-settings-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (confirm('Reset all gesture settings to defaults?')) {
          manager.resetPreferences();
          window.location.reload();
        }
      });
      resetBtn.addEventListener('mouseenter', () => {
        resetBtn.style.background = 'var(--border)';
      });
      resetBtn.addEventListener('mouseleave', () => {
        resetBtn.style.background = 'var(--surface2)';
      });
    }
  }

  mount(selector) {
    const container = document.querySelector(selector);
    if (!container) {
      console.warn('Gesture settings container not found:', selector);
      return;
    }
    const panel = this.create();
    container.appendChild(panel);
    this.container = panel;
    return panel;
  }

  unmount() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
      this.container = null;
    }
  }
}

// Export for use in settings page
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GestureSettingsPanel };
}
