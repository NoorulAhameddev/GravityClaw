#!/usr/bin/env node

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * Touch Gestures Quick Reference Guide
 * ═════════════════════════════════════════════════════════════════════════════
 * 
 * Common use cases and code snippets for developers
 */

// ═════════════════════════════════════════════════════════════════════════════
// Quick Start
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Touch gestures are automatically initialized in index.html.
 * Access via: window._gestureManager or window.GestureAPI
 */

// Check if gestures are available
if (window._gestureManager?.isSupported()) {
  console.log('✓ Touch gestures available');
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. Swipe Navigation
// ═════════════════════════════════════════════════════════════════════════════

// Swipe automatically navigates pages
// No code needed! Just swipe left/right on the page

// Customize swipe sensitivity (0.5x to 2.0x)
window._gestureManager?.setPreference('swipeSensitivity', 1.5);

// Disable swipe navigation
window._gestureManager?.setPreference('swipeEnabled', false);

// Programmatic navigation (works cross-browser)
navigate('dashboard');  // Uses existing navigate() function

// ═════════════════════════════════════════════════════════════════════════════
// 2. Pull-to-Refresh
// ═════════════════════════════════════════════════════════════════════════════

// Automatically refreshes current page on pull-down
// No code needed! Just pull down from the top

// Disable pull-to-refresh
window._gestureManager?.setPreference('pullToRefreshEnabled', false);

// Custom refresh handler (optional)
window.onPageRefresh = async (currentPage) => {
  console.log('Page refresh requested for:', currentPage);
  // Your custom refresh logic
};

// ═════════════════════════════════════════════════════════════════════════════
// 3. Long-Press Context Menu
// ═════════════════════════════════════════════════════════════════════════════

// Mark elements as long-pressable:
// Add `data-long-pressable` attribute to any element
document.querySelector('.item')?.setAttribute('data-long-pressable', '');

// Listen for context menu actions
document.addEventListener('contextmenu-action', (e) => {
  const { action, element } = e.detail;
  
  if (action === 'copy') {
    console.log('User wants to copy:', element.textContent);
  } else if (action === 'edit') {
    console.log('User wants to edit:', element);
  } else if (action === 'delete') {
    console.log('User wants to delete:', element);
  } else if (action === 'share') {
    console.log('User wants to share:', element);
  }
});

// Disable long-press
window._gestureManager?.setPreference('longPressEnabled', false);

// ═════════════════════════════════════════════════════════════════════════════
// 4. Pinch-to-Zoom
// ═════════════════════════════════════════════════════════════════════════════

// Mark elements as zoomable:
// Add `data-chart-zoomable` attribute to any element
document.querySelector('.chart')?.setAttribute('data-chart-zoomable', '');

// Users can now:
// - Pinch to zoom (1x to 3x)
// - Double-tap to reset zoom

// Disable pinch-to-zoom
window._gestureManager?.setPreference('pinchZoomEnabled', false);

// ═════════════════════════════════════════════════════════════════════════════
// 5. Haptic Feedback
// ═════════════════════════════════════════════════════════════════════════════

// Check if haptics supported
if ('vibrate' in navigator) {
  console.log('✓ Haptic feedback supported');
}

// Trigger haptic feedback programmatically
const manager = window._gestureManager;
manager?.vibration?.light();           // 10ms vibration
manager?.vibration?.medium();          // 30ms vibration
manager?.vibration?.strong();          // 100ms vibration
manager?.vibration?.vibrate(50);       // Custom duration
manager?.vibration?.pattern([100, 50, 100]);  // Pattern: vibrate, pause, vibrate

// Disable all haptics
window._gestureManager?.setPreference('hapticFeedbackEnabled', false);

// ═════════════════════════════════════════════════════════════════════════════
// 6. Keyboard Shortcuts (Non-Touch Fallback)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Arrow Left  - Previous page (swipe right)
 * Arrow Right - Next page (swipe left)
 * Ctrl+R      - Refresh current page
 * Ctrl+1      - Navigate to Chat
 * Ctrl+2      - Navigate to Dashboard
 * Ctrl+3      - Navigate to Memory
 */

// These work automatically! No code needed.

// ═════════════════════════════════════════════════════════════════════════════
// 7. Gesture Preferences API
// ═════════════════════════════════════════════════════════════════════════════

const GestureAPI = window.GestureAPI;

// Get all preferences
const prefs = GestureAPI.getPreferences();
console.log('Gesture preferences:', prefs);

// Check if gesture is enabled
if (GestureAPI.isEnabled('swipe')) {
  console.log('Swipe navigation is enabled');
}

// Enable/disable gestures
GestureAPI.setEnabled('swipe', true);
GestureAPI.setEnabled('pullToRefresh', false);

// Set specific preference
GestureAPI.setPreference('swipeSensitivity', 1.2);

// Reset all to defaults
GestureAPI.resetAll();

// Trigger haptics
GestureAPI.haptic('light');    // or 'medium', 'strong'
GestureAPI.haptic(25);          // Custom milliseconds

// Show toast notification
GestureAPI.notify('Action completed!');
GestureAPI.notify('Warning!', 3000);  // 3 second duration

// Check touch support
if (GestureAPI.isSupported()) {
  console.log('Device supports touch');
}

// ═════════════════════════════════════════════════════════════════════════════
// 8. Mobile Detection
// ═════════════════════════════════════════════════════════════════════════════

// Detect device type
const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
const isTablet = /iPad|Android(?!.*Mobi)/i.test(navigator.userAgent);
const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

// Optimize UI conditionally
if (hasTouch) {
  console.log('This is a touch device');
  // Increase button sizes, spacing, etc.
}

// ═════════════════════════════════════════════════════════════════════════════
// 9. Settings Panel UI
// ═════════════════════════════════════════════════════════════════════════════

// Add gesture settings UI to your settings page:

// 1. Create container in HTML:
// <div id="gesture-settings"></div>

// 2. Mount settings panel:
if (document.getElementById('gesture-settings')) {
  const settingsUI = new GestureSettingsPanel();
  settingsUI.mount('#gesture-settings');
}

// Users can now:
// - Toggle each gesture on/off
// - Adjust swipe sensitivity
// - Toggle haptic feedback
// - Test vibration
// - See device capabilities
// - Reset to defaults

// ═════════════════════════════════════════════════════════════════════════════
// 10. PWA Features
// ═════════════════════════════════════════════════════════════════════════════

// Check PWA installation status
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    console.log('Service Workers installed:', regs.length);
  });
}

// Listen for installation prompt
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  console.log('PWA install prompt ready');
  // Show custom install button if desired
  e.prompt();  // Show install prompt
});

// Check if app is already installed
if (window.matchMedia('(display-mode: standalone)').matches) {
  console.log('App running as PWA');
}

// Clear service worker cache (debugging)
caches.keys().then(names => {
  names.forEach(name => caches.delete(name));
  console.log('Cache cleared');
});

// ═════════════════════════════════════════════════════════════════════════════
// 11. Real-World Examples
// ═════════════════════════════════════════════════════════════════════════════

// Example 1: Long-pressable list items
function setupLongPressableList() {
  document.querySelectorAll('.list-item').forEach(item => {
    item.setAttribute('data-long-pressable', '');
    item.dataset.id = item.id;  // Store ID for actions
  });

  document.addEventListener('contextmenu-action', (e) => {
    const { action, element } = e.detail;
    const itemId = element.dataset.id;

    if (action === 'delete') {
      fetch(`/api/items/${itemId}`, { method: 'DELETE' })
        .then(() => {
          element.remove();
          GestureAPI.notify('Deleted');
          GestureAPI.haptic('medium');
        });
    } else if (action === 'edit') {
      window.location.href = `/edit/${itemId}`;
    }
  });
}

// Example 2: Zoomable chart
function setupZoomableChart() {
  const chart = document.querySelector('.my-chart');
  chart?.setAttribute('data-chart-zoomable', '');
  // Chart can now be pinch-zoomed!
}

// Example 3: Smart refresh with loading state
async function handleSmartRefresh(page) {
  const loader = document.querySelector('.refresh-loader');
  
  try {
    loader?.classList.add('visible');
    
    // Fetch fresh data
    const response = await fetch(`/api/${page}/refresh`);
    const data = await response.json();
    
    // Update UI
    updatePageContent(data);
    
    GestureAPI.notify('Refreshed!');
    GestureAPI.haptic('light');
  } catch (error) {
    GestureAPI.notify('Refresh failed', 3000);
    GestureAPI.haptic('strong');
  } finally {
    loader?.classList.remove('visible');
  }
}

// Example 4: Copy with feedback
function setupCopyButtons() {
  document.querySelectorAll('[data-copy]').forEach(el => {
    el.setAttribute('data-long-pressable', '');
  });

  document.addEventListener('contextmenu-action', (e) => {
    if (e.detail.action === 'copy') {
      const text = e.detail.element.textContent;
      navigator.clipboard.writeText(text);
      
      GestureAPI.notify('📋 Copied!');
      GestureAPI.haptic('light');
    }
  });
}

// Example 5: Gesture preference persistence
function saveUserGesturePrefs() {
  const userPrefs = {
    swipeEnabled: true,
    pullToRefreshEnabled: true,
    hapticFeedbackEnabled: true,
    swipeSensitivity: 1.0,
  };

  // Save to user account
  fetch('/api/user/preferences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gestures: userPrefs }),
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 12. Debugging & Testing
// ═════════════════════════════════════════════════════════════════════════════

// Log all events
function enableGestureDebug() {
  // Swipe
  document.addEventListener('swipe', (e) => {
    console.log('SWIPE:', e.detail);
  });

  // Long press
  document.addEventListener('long-press', (e) => {
    console.log('LONG-PRESS:', e.target);
  });

  // Context menu action
  document.addEventListener('contextmenu-action', (e) => {
    console.log('CONTEXT-MENU:', e.detail.action, e.detail.element);
  });

  // Pull to refresh
  document.addEventListener('pull-to-refresh', (e) => {
    console.log('PULL-TO-REFRESH');
  });
}

// Simulate swipe gesture (testing)
function simulateSwipe(direction, distance = 100) {
  const event = new TouchEvent('touchstart', {
    bubbles: true,
    touches: [{ clientX: 100, clientY: 100 }],
  });
  document.body.dispatchEvent(event);

  const endX = direction === 'left' ? 100 - distance : 100 + distance;
  const moveEvent = new TouchEvent('touchmove', {
    bubbles: true,
    touches: [{ clientX: endX, clientY: 100 }],
  });
  document.body.dispatchEvent(moveEvent);

  const endEvent = new TouchEvent('touchend', {
    bubbles: true,
    changedTouches: [{ clientX: endX, clientY: 100 }],
  });
  document.body.dispatchEvent(endEvent);
}

// Test haptic feedback
function testHaptics() {
  console.log('🔊 LIGHT (10ms)');
  GestureAPI.haptic('light');
  
  setTimeout(() => {
    console.log('🔊 MEDIUM (30ms)');
    GestureAPI.haptic('medium');
  }, 200);
  
  setTimeout(() => {
    console.log('🔊 STRONG (100ms)');
    GestureAPI.haptic('strong');
  }, 400);

  setTimeout(() => {
    console.log('🔊 PATTERN [100,50,100]');
    GestureAPI.haptic([100, 50, 100]);
  }, 600);
}

// ═════════════════════════════════════════════════════════════════════════════
// 13. Common Patterns
// ═════════════════════════════════════════════════════════════════════════════

// Pattern 1: Page-specific gesture handling
function initPageGestures(pageName) {
  if (pageName === 'dashboard') {
    // Dashboard-specific setup
    document.querySelectorAll('.metric').forEach(m => {
      m.setAttribute('data-long-pressable', '');
    });
  } else if (pageName === 'memory') {
    // Memory-specific setup
    document.querySelectorAll('.fact').forEach(f => {
      f.setAttribute('data-long-pressable', '');
    });
  }
}

// Pattern 2: Conditional feature based on device
if (GestureAPI.isSupported()) {
  // Show swipe hints
  document.querySelector('.swipe-hint')?.classList.remove('hidden');
} else {
  // Show keyboard hints instead
  document.querySelector('.keyboard-hint')?.classList.remove('hidden');
}

// Pattern 3: Progressive enhancement
const baseFeatures = {
  navigation: 'keyboard',   // Always available
  refresh: 'menu',          // Always available
  copy: 'double-click',     // Desktop
};

const enhancedFeatures = {
  navigation: 'swipe',      // Mobile
  refresh: 'pull-down',     // Mobile
  copy: 'long-press',       // Mobile
};

const activeFeatures = GestureAPI.isSupported() 
  ? enhancedFeatures 
  : baseFeatures;

// ═════════════════════════════════════════════════════════════════════════════
// Ready-to-Use Functions
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Initialize all common gesture setups
 */
function setupAllGestures() {
  setupLongPressableList();
  setupZoomableChart();
  setupCopyButtons();
  
  console.log('✓ All gestures configured');
}

/**
 * Reset user gesture preferences to app defaults
 */
function resetGesturesDefault() {
  GestureAPI.resetAll();
  location.reload();
}

/**
 * Export current gesture preferences to JSON
 */
function exportGesturePreferences() {
  const prefs = GestureAPI.getPreferences();
  const json = JSON.stringify(prefs, null, 2);
  console.log(json);
  return json;
}

/**
 * Import gesture preferences from JSON
 */
function importGesturePreferences(jsonString) {
  try {
    const prefs = JSON.parse(jsonString);
    Object.entries(prefs).forEach(([key, value]) => {
      GestureAPI.setPreference(key, value);
    });
    console.log('✓ Preferences imported');
  } catch (error) {
    console.error('Import failed:', error);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// End of Quick Reference
// ═════════════════════════════════════════════════════════════════════════════

console.log('Touch Gestures Quick Reference loaded');
console.log('Access via window.GestureAPI or window._gestureManager');
