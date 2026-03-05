# Mobile Touch Gestures for Gravity Claw Dashboard

## Overview

A comprehensive touch gesture system for mobile devices providing:

- **Swipe Navigation** - Navigate pages with left/right swipes
- **Pull-to-Refresh** - Pull down to refresh current page content
- **Long-Press Context Menu** - Long press items for copy/edit/delete/share options
- **Pinch-to-Zoom** - Zoom charts and content with pinch gesture
- **Haptic Feedback** - Vibration feedback on gesture completion
- **PWA Support** - Progressive web app capabilities with offline support
- **Keyboard Fallback** - Arrow keys and keyboard shortcuts for non-touch devices

## File Structure

```
public/
├── components/
│   ├── touch-gestures.js      # Main gesture detection system
│   └── gesture-settings.js    # Settings UI component
├── sw.js                       # Service Worker (PWA support)
├── manifest.json               # PWA manifest
└── index.html                  # Updated with PWA meta tags
```

## Quick Start

### 1. Include the Script

The touch-gestures.js is automatically included in index.html:

```html
<script src="/components/touch-gestures.js"></script>
<script>
  // Initialize after DOM is ready
  const gestureManager = TouchGestureManager.init();
</script>
```

### 2. Configuration

Configure gestures before initialization:

```javascript
const opts = {
  enableLogging: true,  // Debug logging
};
const gestureManager = TouchGestureManager.init(opts);
```

### 3. Access Preferences

```javascript
// Get all preferences
const prefs = gestureManager.getPreferences();

// Get specific preference
const swipeEnabled = gestureManager.getPreferences().swipeEnabled;

// Set preference
gestureManager.setPreference('swipeEnabled', true);

// Reset to defaults
gestureManager.resetPreferences();

// Check touch support
if (gestureManager.isSupported()) {
  console.log('Touch gestures available');
}
```

## Features

### 1. Swipe Navigation

**Gesture**: Swipe left (next page) or right (previous page)

**Configuration**:
```javascript
GESTURE_CONFIG.swipe = {
  minDistance: 50,        // Minimum swipe distance (px)
  maxDistance: 500,       // Maximum swipe distance (px)
  minVelocity: 0.5,       // Minimum velocity (px/ms)
  maxTime: 500,           // Maximum time for swipe (ms)
  enabled: true,
};
```

**Pages Navigated**:
- Chat
- Dashboard
- Memory
- Canvas
- Tools

**Visual Feedback**:
- Swipe indicator gradient overlay
- Light haptic feedback on completion

**Accessibility**:
- Arrow keys: Left/Right to navigate
- Ctrl/Cmd+1/2/3: Jump to specific page

### 2. Pull-to-Refresh

**Gesture**: Pull down from top of page

**Configuration**:
```javascript
GESTURE_CONFIG.pullToRefresh = {
  minDistance: 80,        // Minimum pull distance (px)
  maxDistance: 200,       // Maximum pull distance (px)
  enabled: true,
  resistance: 0.5,        // Display distance multiplier
};
```

**Refresh Actions**:
- **Chat**: Re-connect WebSocket, reload messages
- **Dashboard**: Call `loadDashboard()`
- **Memory**: Call `loadMemory()`
- **Tools**: Call `loadTools()`
- **Canvas**: Call `loadCanvas()`

**Visual Feedback**:
- Rotating spinner indicator
- Progress animation
- Color change when ready to refresh
- Auto-dismiss after completion

**Implementation**:
```javascript
// Custom refresh handler (optional)
window.onPageRefresh = async (currentPage) => {
  console.log('Refreshing:', currentPage);
  // Custom logic here
};
```

### 3. Long-Press Context Menu

**Gesture**: Long press (500ms) on element with `data-long-pressable` attribute

**Configuration**:
```javascript
GESTURE_CONFIG.longPress = {
  duration: 500,          // Long press duration (ms)
  enabled: true,
  vibration: 50,          // Vibration strength (ms)
};
```

**Menu Options**:
1. **Copy** - Copy element text to clipboard
2. **Edit** - Dispatch `item-edit` event
3. **Delete** - Dispatch `item-delete` event
4. **Share** - Use Web Share API if available

**Making Elements Long-Pressable**:

```html
<!-- Add data-long-pressable attribute -->
<div class="memory-fact" data-long-pressable>
  Important fact
</div>

<div class="message" data-long-pressable>
  Message content
</div>
```

**Listening for Actions**:

```javascript
document.addEventListener('contextmenu-action', (e) => {
  const { action, element } = e.detail;
  
  if (action === 'copy') {
    // Handle copy
  } else if (action === 'edit') {
    // Handle edit
  } else if (action === 'delete') {
    // Handle delete
  } else if (action === 'share') {
    // Handle share
  }
});
```

### 4. Pinch-to-Zoom

**Gesture**: Two-finger pinch or double-tap to zoom

**Configuration**:
```javascript
GESTURE_CONFIG.pinchZoom = {
  minZoom: 1.0,           // Minimum zoom level
  maxZoom: 3.0,           // Maximum zoom level
  doubleTapZoom: 1.5,     // Double tap zoom level
  enabled: true,
  vibration: 20,          // Light vibration (ms)
};
```

**Making Elements Zoomable**:

```html
<!-- Add data-chart-zoomable attribute -->
<div class="chart" data-chart-zoomable>
  <canvas id="my-chart"></canvas>
</div>
```

**Controls**:
- **Two-finger pinch**: Continuous zoom
- **Double-tap**: Reset to 1x zoom (with light vibration)

### 5. Haptic Feedback

**Configuration**:
```javascript
GESTURE_CONFIG.haptics = {
  enabled: true,
  light: 10,              // Light vibration (ms)
  medium: 30,             // Medium vibration (ms)
  strong: 100,            // Strong vibration (ms)
};
```

**API**:

```javascript
const manager = TouchGestureManager.instance;

// Simple vibrations
await manager.vibration.light();      // 10ms
await manager.vibration.medium();     // 30ms
await manager.vibration.strong();     // 100ms

// Custom vibration
await manager.vibration.vibrate(50);  // 50ms

// Vibration patterns (pause between)
await manager.vibration.pattern([100, 50, 100]);  // Vibrate 100ms, pause 50ms, vibrate 100ms
```

**Browser Support**:
- iOS 13+: Light vibrations only
- Android: Full support
- Check with `'vibrate' in navigator`

### 6. Touch-Optimized UI

Automatically applied CSS:

```css
/* Minimum touch target size: 44x44px */
button, a, [role="button"] {
  min-height: 44px;
  min-width: 44px;
}

/* Input fields: larger for easier typing */
input[type="text"],
input[type="email"],
textarea,
select {
  min-height: 48px;
  font-size: 16px;  /* Prevents iOS zoom on focus */
}

/* Safe area support for notches */
@supports (padding: max(0px)) {
  body {
    padding: max(12px, env(safe-area-inset-*));
  }
}

/* Responsive font sizes */
@media (max-width: 768px) {
  body { font-size: 16px; }
  h1 { font-size: 24px; }
  h2 { font-size: 20px; }
}

/* Disable hover on touch devices */
@media (hover: none) {
  button:hover { background: unset; }
}
```

## PWA Installation

### Progressive Web App Features

**Manifest File** (`manifest.json`):
- App name and icon
- Start URL and display mode
- Theme colors
- App shortcuts (Chat, Dashboard, Memory)
- Share target configuration
- Screenshots for app store

**Installation Prompt**:
- Automatically shown 30 seconds after first visit
- "Install App" button appears in bottom-right
- Customizable via `beforeinstallprompt` event

**Offline Support**:
- Service Worker caches essential assets
- Network-first strategy for API calls
- Cache-first strategy for static files
- Offline fallback pages

### Manual Installation

**iOS**:
1. Open in Safari
2. Tap Share → Add to Home Screen
3. Name the app
4. Add to home screen

**Android**:
1. Open in Chrome
2. Tap menu (three dots)
3. Tap "Install app" or "Add to Home Screen"
4. Confirm installation

**Desktop**:
1. Open in Chrome/Edge
2. Address bar shows install icon
3. Click to install as standalone app

## Settings UI

Add gesture settings panel to your dashboard:

```html
<!-- Include in settings page -->
<script src="/components/gesture-settings.js"></script>

<div id="settings-container"></div>

<script>
  const settingsPanel = new GestureSettingsPanel();
  settingsPanel.mount('#settings-container');
</script>
```

**Settings Available**:
- Enable/disable each gesture
- Adjust swipe sensitivity (0.5x to 2.0x)
- Toggle haptic feedback
- Test vibration
- View device capabilities
- Reset to defaults

## Keyboard Shortcuts (Non-Touch Fallback)

| Shortcut | Action |
|----------|--------|
| Arrow Left | Previous page (swipe right) |
| Arrow Right | Next page (swipe left) |
| Ctrl+R | Refresh current page |
| Ctrl+1 | Navigate to Chat |
| Ctrl+2 | Navigate to Dashboard |
| Ctrl+3 | Navigate to Memory |

## Browser Compatibility

| Feature | iOS | Android | Desktop | Notes |
|---------|-----|---------|---------|-------|
| Swipe Navigation | ✓ | ✓ | ✓ | Mouse drag simulates swipe |
| Pull-to-Refresh | ✓ | ✓ | Partial | Not useful on desktop |
| Long-Press | ✓ | ✓ | ✓ | 500ms threshold |
| Pinch-to-Zoom | ✓ | ✓ | ✗ | Requires 2-finger touch |
| Haptic/Vibration | ✓ | ✓ | ✗ | Not supported on desktop |
| PWA Install | ✓ iOS17+ | ✓ Chrome | ✓ Chrome/Edge | Browser dependent |
| Service Worker | ✓ | ✓ | ✓ | HTTPS required |

### iOS Specific

- Requires iOS 13.4+ for full touch support
- Add to Home Screen provides standalone experience
- Safe area handled with `env(safe-area-inset-*)` CSS
- Status bar style: `black-translucent`
- No haptic feedback for strong vibrations (policy limit)

### Android Specific

- Chrome 39+, Firefox, Samsung Internet
- Full touch support including haptics
- System gestures may conflict (back swipe)
- Navigation bar accessibility important

## Advanced Usage

### Custom Gesture Events

```javascript
// Listen for swipe events
document.addEventListener('swipe', (e) => {
  const { direction, velocity, distance } = e.detail;
  console.log(`Swiped ${direction} with velocity ${velocity}`);
});

// Listen for refresh events
document.addEventListener('pull-to-refresh', (e) => {
  console.log('User pulled to refresh');
});

// Listen for long-press
document.addEventListener('long-press', (e) => {
  console.log('Long pressed:', e.target);
});
```

### Creating Custom Detector Classes

```javascript
class CustomGestureDetector {
  constructor(element, callback, prefs) {
    this.element = element;
    this.callback = callback;
    this.prefs = prefs;
    this.attach();
  }

  attach() {
    this.element.addEventListener('touchstart', this.onStart.bind(this));
    this.element.addEventListener('touchmove', this.onMove.bind(this));
    this.element.addEventListener('touchend', this.onEnd.bind(this));
  }

  onStart(e) { /* custom logic */ }
  onMove(e) { /* custom logic */ }
  onEnd(e) { /* custom logic */ }
}
```

### Extending Touch Gesture Manager

```javascript
const manager = TouchGestureManager.init();

// Add custom detector
manager.customDetector = new CustomGestureDetector(
  document.body,
  (result) => { /* handle custom gesture */ },
  manager.prefs
);

// Disable specific gestures
manager.setPreference('swipeEnabled', false);

// Custom refresh handler
window.onPageRefresh = async (page) => {
  // Your custom logic
  console.log('Refreshing:', page);
};
```

## Troubleshooting

### Gestures Not Working

1. **Check touch support**:
```javascript
const manager = TouchGestureManager.instance;
console.log('Touch supported:', manager.isSupported());
```

2. **Check preferences enabled**:
```javascript
console.log(manager.getPreferences());
```

3. **Enable debug logging**:
```javascript
GESTURE_CONFIG.general.enableLogging = true;
```

4. **Clear cache**:
```javascript
// Clear service worker cache
navigator.serviceWorker.getRegistrations().then(regs => {
  regs.forEach(reg => reg.unregister());
});

// Clear preferences
manager.resetPreferences();
```

### Vibration Not Working

- Check device support: `'vibrate' in navigator`
- Check haptic feedback enabled: `manager.prefs.get('hapticFeedbackEnabled')`
- iOS may limit vibration patterns
- Some devices may have vibration disabled in settings

### Swipe Conflicts

- Adjust sensitive: `gestureManager.setPreference('swipeSensitivity', 0.8)`
- Increase min distance: Update `GESTURE_CONFIG.swipe.minDistance`
- Disable swipe on specific elements

### Performance Issues

- Reduce `pullToRefresh` max distance
- Increase `swipe.minDistance` threshold
- Disable unused gestures
- Check for memory leaks in refresh handlers

## Performance Tips

1. **Debounce refresh handlers**:
```javascript
let refreshing = false;
window.onPageRefresh = async (page) => {
  if (refreshing) return;
  refreshing = true;
  try {
    await loadData(page);
  } finally {
    refreshing = false;
  }
};
```

2. **Lazy load long-pressable elements**:
```javascript
const observer = new MutationObserver(() => {
  document.querySelectorAll('[data-item]:not([data-long-pressable])').forEach(el => {
    el.setAttribute('data-long-pressable', '');
  });
});
observer.observe(document.body, { childList: true, subtree: true });
```

3. **Limit vibration patterns**:
```javascript
// Keep vibrations short
manager.vibration?.light();  // 10ms
// Avoid long patterns that drain battery
// manager.vibration?.pattern([1000, 100, 1000]);  // Bad!
```

## Examples

### Add Gesture Settings to Dashboard

```javascript
// In dashboard or settings page
if (document.getElementById('gesture-settings')) {
  const settingsPanel = new GestureSettingsPanel();
  settingsPanel.mount('#gesture-settings');
}
```

### Custom Context Menu Action

```javascript
document.addEventListener('contextmenu-action', (e) => {
  const { action, element } = e.detail;

  if (action === 'delete') {
    const itemId = element.dataset.id;
    fetch(`/api/items/${itemId}`, { method: 'DELETE' })
      .then(() => element.remove())
      .catch(err => console.error('Delete failed:', err));
  }
});
```

### Swipe-based Modal Navigation

```javascript
document.addEventListener('swipe', (e) => {
  const modal = document.querySelector('.modal.active');
  if (!modal) return;

  const direction = e.detail.direction;
  const nextStep = direction === 'left' ? 1 : -1;
  
  // Navigate to next/previous step in modal
  modal.dispatchEvent(new CustomEvent('step-change', {
    detail: { direction: nextStep }
  }));
});
```

## Related Documentation

- [PWA Documentation](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/)
- [Touch Events API](https://developer.mozilla.org/en-US/docs/Web/API/Touch_events)
- [Vibration API](https://developer.mozilla.org/en-US/docs/Web/API/Vibration_API)
- [Service Worker](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [Web App Manifest](https://developer.mozilla.org/en-US/docs/Web/Manifest)

## License

Same as Gravity Claw project
