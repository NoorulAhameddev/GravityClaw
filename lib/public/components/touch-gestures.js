/**
 * ═════════════════════════════════════════════════════════════════════════════
 * Gravity Claw — Mobile Touch Gestures System
 * ═════════════════════════════════════════════════════════════════════════════
 * 
 * Provides comprehensive touch gesture support for mobile devices:
 * - Swipe navigation between pages (left/right)
 * - Pull-to-refresh for dynamic content
 * - Long-press context menus
 * - Pinch-to-zoom for charts
 * - Haptic/vibration feedback
 * - PWA capabilities
 * - Fallback for non-touch devices
 * 
 * Integration: Include this script before app.js
 * Usage: TouchGestureManager.init(options)
 */

// ═════════════════════════════════════════════════════════════════════════════
// Configuration & Defaults
// ═════════════════════════════════════════════════════════════════════════════

const GESTURE_CONFIG = {
  // Swipe settings
  swipe: {
    minDistance: 50,
    maxDistance: 500,
    minVelocity: 0.5,
    maxTime: 500,
    enabled: true,
  },
  
  // Pull-to-refresh settings
  pullToRefresh: {
    minDistance: 80,
    maxDistance: 200,
    enabled: true,
    resistance: 0.5, // Pull distance multiplier
  },
  
  // Long-press settings
  longPress: {
    duration: 500,
    enabled: true,
    vibration: 50,
  },
  
  // Pinch-to-zoom settings
  pinchZoom: {
    minZoom: 1.0,
    maxZoom: 3.0,
    doubleTapZoom: 1.5,
    enabled: true,
    vibration: 20,
  },
  
  // Vibration settings
  haptics: {
    enabled: true,
    light: 10,
    medium: 30,
    strong: 100,
  },
  
  // General settings
  general: {
    enableLogging: false,
    removeHoverOnTouch: true,
    preventDefaultonLongPress: true,
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// Gesture Preferences (stored in localStorage)
// ═════════════════════════════════════════════════════════════════════════════

class GesturePreferences {
  constructor() {
    this.storageKey = 'gravyclaw_gesture_prefs';
    this.defaults = {
      swipeEnabled: true,
      pullToRefreshEnabled: true,
      longPressEnabled: true,
      pinchZoomEnabled: true,
      hapticFeedbackEnabled: true,
      swipeSensitivity: 1.0, // 0.5 to 2.0
      soundEnabled: false,
    };
    this.load();
  }

  load() {
    const stored = localStorage.getItem(this.storageKey);
    this.prefs = stored ? JSON.parse(stored) : { ...this.defaults };
    // Ensure all keys exist
    Object.keys(this.defaults).forEach(key => {
      if (!(key in this.prefs)) this.prefs[key] = this.defaults[key];
    });
  }

  save() {
    localStorage.setItem(this.storageKey, JSON.stringify(this.prefs));
  }

  get(key, defaultValue = undefined) {
    return this.prefs[key] !== undefined ? this.prefs[key] : defaultValue;
  }

  set(key, value) {
    this.prefs[key] = value;
    this.save();
  }

  reset() {
    this.prefs = { ...this.defaults };
    this.save();
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Vibration/Haptics Manager
// ═════════════════════════════════════════════════════════════════════════════

class VibrationManager {
  constructor(prefs) {
    this.prefs = prefs;
    this.supported = 'vibrate' in navigator;
  }

  async vibrate(duration = 20) {
    if (!this.supported || !this.prefs.get('hapticFeedbackEnabled')) return;
    try {
      navigator.vibrate(duration);
    } catch (e) {
      console.debug('Vibration not available:', e.message);
    }
  }

  async light() {
    await this.vibrate(GESTURE_CONFIG.haptics.light);
  }

  async medium() {
    await this.vibrate(GESTURE_CONFIG.haptics.medium);
  }

  async strong() {
    await this.vibrate(GESTURE_CONFIG.haptics.strong);
  }

  async pattern(pattern) {
    if (!this.supported) return;
    try {
      navigator.vibrate(pattern);
    } catch (e) {
      console.debug('Vibration pattern not available:', e.message);
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Swipe Gesture Detector
// ═════════════════════════════════════════════════════════════════════════════

class SwipeDetector {
  constructor(element, onSwipe, prefs) {
    this.element = element;
    this.onSwipe = onSwipe;
    this.prefs = prefs;
    this.touching = false;
    this.startX = 0;
    this.startY = 0;
    this.startTime = 0;
    this.currentX = 0;
    this.currentY = 0;
    this.swipeOverlay = null;
    
    this.handleTouchStart = this.handleTouchStart.bind(this);
    this.handleTouchMove = this.handleTouchMove.bind(this);
    this.handleTouchEnd = this.handleTouchEnd.bind(this);
    
    this.attach();
  }

  attach() {
    this.element.addEventListener('touchstart', this.handleTouchStart, false);
    this.element.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    this.element.addEventListener('touchend', this.handleTouchEnd, false);
  }

  detach() {
    this.element.removeEventListener('touchstart', this.handleTouchStart);
    this.element.removeEventListener('touchmove', this.handleTouchMove);
    this.element.removeEventListener('touchend', this.handleTouchEnd);
  }

  handleTouchStart(e) {
    if (!this.prefs.get('swipeEnabled') || GESTURE_CONFIG.swipe.enabled === false) return;
    const touch = e.touches[0];
    this.touching = true;
    this.startX = touch.clientX;
    this.startY = touch.clientY;
    this.startTime = Date.now();
    this.currentX = this.startX;
    this.currentY = this.startY;
  }

  handleTouchMove(e) {
    if (!this.touching) return;
    const touch = e.touches[0];
    this.currentX = touch.clientX;
    this.currentY = touch.clientY;
    
    // Show swipe indicator
    this.showSwipeIndicator();
  }

  handleTouchEnd(e) {
    if (!this.touching) return;
    this.touching = false;
    this.hideSwipeIndicator();

    const deltaX = this.currentX - this.startX;
    const deltaY = this.currentY - this.startY;
    const duration = Date.now() - this.startTime;
    const distance = Math.abs(deltaX);
    const velocity = distance / duration;

    // Apply sensitivity multiplier
    const minDistance = GESTURE_CONFIG.swipe.minDistance * 
                       this.prefs.get('swipeSensitivity', 1.0);
    const minVelocity = GESTURE_CONFIG.swipe.minVelocity;

    // Must be mostly horizontal (vertical delta < horizontal delta)
    const isHorizontal = Math.abs(deltaY) < Math.abs(deltaX) * 0.5;
    const meetDistance = Math.abs(distance) >= minDistance;
    const meetVelocity = velocity >= minVelocity && duration <= GESTURE_CONFIG.swipe.maxTime;

    if (isHorizontal && meetDistance && meetVelocity) {
      const direction = deltaX > 0 ? 'right' : 'left';
      this.onSwipe(direction);
    }
  }

  showSwipeIndicator() {
    if (!this.swipeOverlay) {
      this.swipeOverlay = document.createElement('div');
      this.swipeOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(to right, 
          rgba(99, 102, 241, 0.05) 0%,
          transparent 50%,
          rgba(99, 102, 241, 0.05) 100%);
        pointer-events: none;
        z-index: 1000;
        opacity: 0;
        transition: opacity 0.1s;
      `;
      document.body.appendChild(this.swipeOverlay);
    }

    const progress = Math.min(
      Math.abs(this.currentX - this.startX) / GESTURE_CONFIG.swipe.minDistance,
      1.0
    );
    this.swipeOverlay.style.opacity = progress * 0.3;
  }

  hideSwipeIndicator() {
    if (this.swipeOverlay) {
      this.swipeOverlay.style.opacity = '0';
      setTimeout(() => {
        if (this.swipeOverlay && this.swipeOverlay.parentNode) {
          this.swipeOverlay.parentNode.removeChild(this.swipeOverlay);
          this.swipeOverlay = null;
        }
      }, 100);
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Pull-to-Refresh Gesture Detector
// ═════════════════════════════════════════════════════════════════════════════

class PullToRefreshDetector {
  constructor(element, onRefresh, prefs, vibration) {
    this.element = element;
    this.onRefresh = onRefresh;
    this.prefs = prefs;
    this.vibration = vibration;
    this.touching = false;
    this.startY = 0;
    this.currentY = 0;
    this.refreshContainer = null;
    this.refreshSpinner = null;
    this.isRefreshing = false;

    this.handleTouchStart = this.handleTouchStart.bind(this);
    this.handleTouchMove = this.handleTouchMove.bind(this);
    this.handleTouchEnd = this.handleTouchEnd.bind(this);

    this.attach();
  }

  attach() {
    this.element.addEventListener('touchstart', this.handleTouchStart, false);
    this.element.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    this.element.addEventListener('touchend', this.handleTouchEnd, false);
  }

  detach() {
    this.element.removeEventListener('touchstart', this.handleTouchStart);
    this.element.removeEventListener('touchmove', this.handleTouchMove);
    this.element.removeEventListener('touchend', this.handleTouchEnd);
  }

  isScrolledToTop() {
    const scrollable = this.element.querySelector('[data-scrollable]') || 
                      this.element.closest('[data-scrollable]') ||
                      window;
    const scrollTop = scrollable === window ? 
                     window.scrollY || document.documentElement.scrollTop : 
                     scrollable.scrollTop;
    return scrollTop === 0;
  }

  handleTouchStart(e) {
    if (!this.prefs.get('pullToRefreshEnabled') || 
        GESTURE_CONFIG.pullToRefresh.enabled === false ||
        this.isRefreshing) return;
    
    if (this.isScrolledToTop()) {
      this.touching = true;
      this.startY = e.touches[0].clientY;
      this.currentY = this.startY;
    }
  }

  handleTouchMove(e) {
    if (!this.touching) return;
    
    const touch = e.touches[0];
    this.currentY = touch.clientY;
    const distance = Math.max(0, this.currentY - this.startY);

    if (distance > 0) {
      e.preventDefault();
      this.updateRefreshIndicator(distance);
    }
  }

  handleTouchEnd(e) {
    if (!this.touching) return;
    this.touching = false;

    const distance = Math.max(0, this.currentY - this.startY);
    const minDistance = GESTURE_CONFIG.pullToRefresh.minDistance;

    if (distance >= minDistance && !this.isRefreshing) {
      this.vibration?.medium();
      this.performRefresh();
    } else {
      this.resetRefreshIndicator();
    }
  }

  updateRefreshIndicator(distance) {
    if (!this.refreshContainer) {
      this.createRefreshContainer();
    }

    const maxDistance = GESTURE_CONFIG.pullToRefresh.maxDistance;
    const resistance = GESTURE_CONFIG.pullToRefresh.resistance;
    const displayDistance = Math.min(distance * resistance, maxDistance);
    const progress = Math.min(distance / GESTURE_CONFIG.pullToRefresh.minDistance, 1.0);

    this.refreshContainer.style.transform = `translateY(${displayDistance}px)`;
    this.refreshContainer.style.opacity = Math.min(progress, 1.0);

    // Rotate spinner based on progress
    const rotation = progress * 360;
    if (this.refreshSpinner) {
      this.refreshSpinner.style.transform = `rotate(${rotation}deg)`;
    }

    // Change color when ready to refresh
    if (progress >= 1.0) {
      this.refreshContainer.classList.add('ready');
    } else {
      this.refreshContainer.classList.remove('ready');
    }
  }

  createRefreshContainer() {
    this.refreshContainer = document.createElement('div');
    this.refreshContainer.style.cssText = `
      position: fixed;
      top: 0;
      left: 50%;
      transform: translateX(-50%) translateY(-60px);
      width: 50px;
      height: 50px;
      z-index: 999;
      opacity: 0;
      transition: opacity 0.2s;
    `;

    this.refreshSpinner = document.createElement('div');
    this.refreshSpinner.style.cssText = `
      width: 100%;
      height: 100%;
      border: 3px solid rgba(99, 102, 241, 0.3);
      border-top-color: rgb(99, 102, 241);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      transition: transform 0.1s;
    `;

    this.refreshContainer.appendChild(this.refreshSpinner);
    document.body.appendChild(this.refreshContainer);

    // Ensure animation exists
    if (!document.getElementById('spin-animation')) {
      const style = document.createElement('style');
      style.id = 'spin-animation';
      style.textContent = `
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }
  }

  resetRefreshIndicator() {
    if (this.refreshContainer) {
      this.refreshContainer.style.transition = 'all 0.3s ease-out';
      this.refreshContainer.style.transform = 'translateX(-50%) translateY(-60px)';
      this.refreshContainer.style.opacity = '0';
      setTimeout(() => {
        if (this.refreshContainer && this.refreshContainer.parentNode) {
          this.refreshContainer.parentNode.removeChild(this.refreshContainer);
          this.refreshContainer = null;
          this.refreshSpinner = null;
        }
      }, 300);
    }
  }

  async performRefresh() {
    this.isRefreshing = true;
    
    try {
      // Show loading state
      if (this.refreshContainer) {
        this.refreshContainer.classList.add('loading');
      }

      // Call the refresh handler
      await this.onRefresh();

      // Keep visible briefly for feedback
      await new Promise(resolve => setTimeout(resolve, 500));
    } finally {
      this.isRefreshing = false;
      this.resetRefreshIndicator();
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Long-Press Context Menu Detector
// ═════════════════════════════════════════════════════════════════════════════

class LongPressDetector {
  constructor(prefs, vibration) {
    this.prefs = prefs;
    this.vibration = vibration;
    this.timeout = null;
    this.currentTarget = null;

    this.handleTouchStart = this.handleTouchStart.bind(this);
    this.handleTouchEnd = this.handleTouchEnd.bind(this);
    this.handleTouchMove = this.handleTouchMove.bind(this);

    this.attach();
  }

  attach() {
    document.addEventListener('touchstart', this.handleTouchStart, false);
    document.addEventListener('touchmove', this.handleTouchMove, false);
    document.addEventListener('touchend', this.handleTouchEnd, false);
  }

  detach() {
    document.removeEventListener('touchstart', this.handleTouchStart);
    document.removeEventListener('touchmove', this.handleTouchMove);
    document.removeEventListener('touchend', this.handleTouchEnd);
  }

  handleTouchStart(e) {
    if (!this.prefs.get('longPressEnabled') || 
        GESTURE_CONFIG.longPress.enabled === false) return;

    this.currentTarget = e.target.closest('[data-long-pressable]');
    if (!this.currentTarget) return;

    this.timeout = setTimeout(() => {
      this.vibration?.strong();
      this.showContextMenu(this.currentTarget, e);
    }, GESTURE_CONFIG.longPress.duration);
  }

  handleTouchMove(e) {
    // Cancel long press if user moves
    if (this.timeout && e.touches.length > 0) {
      const touch = e.touches[0];
      const moveDistance = Math.hypot(
        touch.clientX - this.currentTarget?.lastTouchX || 0,
        touch.clientY - this.currentTarget?.lastTouchY || 0
      );
      if (moveDistance > 10) {
        clearTimeout(this.timeout);
        this.timeout = null;
      }
    }
  }

  handleTouchEnd(e) {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }

  showContextMenu(element, event) {
    const rect = element.getBoundingClientRect();
    const menu = this.createContextMenu(element);
    menu.style.top = Math.min(rect.bottom, window.innerHeight - 200) + 'px';
    menu.style.left = Math.max(0, rect.left) + 'px';
    document.body.appendChild(menu);

    // Close on outside click
    const closeMenu = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
        document.removeEventListener('touchstart', closeMenu);
      }
    };
    setTimeout(() => {
      document.addEventListener('click', closeMenu);
      document.addEventListener('touchstart', closeMenu);
    }, 0);
  }

  createContextMenu(element) {
    const menu = document.createElement('div');
    menu.style.cssText = `
      position: fixed;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      z-index: 2000;
      min-width: 150px;
      animation: slideIn 0.2s ease-out;
    `;

    const actions = [
      { label: 'Copy', icon: '📋', key: 'copy' },
      { label: 'Edit', icon: '✏️', key: 'edit' },
      { label: 'Delete', icon: '🗑️', key: 'delete' },
      { label: 'Share', icon: '📤', key: 'share' },
    ];

    actions.forEach(action => {
      const item = document.createElement('button');
      item.style.cssText = `
        display: block;
        width: 100%;
        padding: 10px 15px;
        background: none;
        border: none;
        color: var(--text);
        cursor: pointer;
        text-align: left;
        font-size: 14px;
        border-bottom: 1px solid var(--border);
        transition: background-color 0.15s;
      `;
      item.innerHTML = `${action.icon} ${action.label}`;
      item.addEventListener('click', () => {
        const event = new CustomEvent('contextmenu-action', {
          detail: { action: action.key, element }
        });
        document.dispatchEvent(event);
        menu.remove();
      });
      item.addEventListener('mouseenter', () => {
        item.style.backgroundColor = 'var(--surface2)';
      });
      item.addEventListener('mouseleave', () => {
        item.style.backgroundColor = 'transparent';
      });
      menu.appendChild(item);
    });

    // Add animation
    if (!document.getElementById('context-menu-animation')) {
      const style = document.createElement('style');
      style.id = 'context-menu-animation';
      style.textContent = `
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `;
      document.head.appendChild(style);
    }

    return menu;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Pinch-to-Zoom for Charts
// ═════════════════════════════════════════════════════════════════════════════

class PinchZoomDetector {
  constructor(prefs, vibration) {
    this.prefs = prefs;
    this.vibration = vibration;
    this.touching = false;
    this.startDistance = 0;
    this.currentDistance = 0;
    this.scale = 1.0;
    this.lastDoubleTapTime = 0;

    this.handleTouchStart = this.handleTouchStart.bind(this);
    this.handleTouchMove = this.handleTouchMove.bind(this);
    this.handleTouchEnd = this.handleTouchEnd.bind(this);

    this.attach();
  }

  attach() {
    document.addEventListener('touchstart', this.handleTouchStart, false);
    document.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    document.addEventListener('touchend', this.handleTouchEnd, false);
  }

  detach() {
    document.removeEventListener('touchstart', this.handleTouchStart);
    document.removeEventListener('touchmove', this.handleTouchMove);
    document.removeEventListener('touchend', this.handleTouchEnd);
  }

  getDistance(touches) {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  handleTouchStart(e) {
    if (!this.prefs.get('pinchZoomEnabled') || 
        GESTURE_CONFIG.pinchZoom.enabled === false) return;

    const now = Date.now();
    const isDoubleTap = now - this.lastDoubleTapTime < 300;
    this.lastDoubleTapTime = now;

    if (e.touches.length === 2) {
      this.touching = true;
      this.startDistance = this.getDistance(e.touches);
      this.currentDistance = this.startDistance;
    } else if (e.touches.length === 1 && isDoubleTap) {
      // Double tap to reset zoom
      this.resetZoom();
    }
  }

  handleTouchMove(e) {
    if (!this.touching || e.touches.length < 2) return;
    
    this.currentDistance = this.getDistance(e.touches);
    const ratio = this.currentDistance / (this.startDistance || this.currentDistance);
    this.scale = Math.max(
      GESTURE_CONFIG.pinchZoom.minZoom,
      Math.min(ratio, GESTURE_CONFIG.pinchZoom.maxZoom)
    );

    this.applyZoom();
  }

  handleTouchEnd(e) {
    if (e.touches.length < 2) {
      this.touching = false;
    }
  }

  applyZoom() {
    const chartElements = document.querySelectorAll('[data-chart-zoomable]');
    chartElements.forEach(el => {
      el.style.transform = `scale(${this.scale})`;
      el.style.transformOrigin = 'center center';
      el.style.transition = 'none';
    });
  }

  resetZoom() {
    this.scale = 1.0;
    this.vibration?.light();
    const chartElements = document.querySelectorAll('[data-chart-zoomable]');
    chartElements.forEach(el => {
      el.style.transform = 'scale(1)';
      el.style.transition = 'transform 0.3s ease-out';
    });
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Touch Gesture Manager (Main Orchestrator)
// ═════════════════════════════════════════════════════════════════════════════

class TouchGestureManager {
  static instance = null;

  static init(options = {}) {
    if (this.instance) return this.instance;
    this.instance = new TouchGestureManager(options);
    return this.instance;
  }

  constructor(options = {}) {
    // Check if touch is supported
    this.touchSupported = 'ontouchstart' in window || 
                         navigator.maxTouchPoints > 0 ||
                         navigator.msMaxTouchPoints > 0;

    this.prefs = new GesturePreferences();
    this.vibration = new VibrationManager(this.prefs);
    this.options = options;

    this.swipeDetector = null;
    this.pullToRefreshDetector = null;
    this.longPressDetector = null;
    this.pinchZoomDetector = null;

    this.init();
  }

  init() {
    this.setupUIOptimizations();
    this.setupSwipeNavigation();
    this.setupPullToRefresh();
    this.setupLongPress();
    this.setupPinchZoom();
    this.setupKeyboardFallback();
    this.setupPWA();
  }

  setupUIOptimizations() {
    if (GESTURE_CONFIG.general.removeHoverOnTouch && this.touchSupported) {
      document.documentElement.classList.add('touch-device');
      
      const style = document.createElement('style');
      style.textContent = `
        /* Disable hover effects on touch devices */
        @media (hover: none) {
          button:hover,
          a:hover,
          input:hover {
            background-color: unset !important;
            color: unset !important;
          }
        }

        /* Touch-optimized sizes */
        button, a, [role="button"] {
          min-height: 44px;
          min-width: 44px;
          padding: 12px 16px;
        }

        input[type="text"],
        input[type="email"],
        input[type="number"],
        textarea,
        select {
          min-height: 48px;
          font-size: 16px; /* Prevent zoom on iOS */
        }

        /* Better spacing */
        .touch-device .nav-item {
          padding: 16px 12px;
        }

        /* Disable text selection on long-press sensitive elements */
        [data-long-pressable] {
          -webkit-user-select: none;
          -moz-user-select: none;
          user-select: none;
        }

        /* Safe area support for notches */
        @supports (padding: max(0px)) {
          body {
            padding-left: max(12px, env(safe-area-inset-left));
            padding-right: max(12px, env(safe-area-inset-right));
            padding-top: max(12px, env(safe-area-inset-top));
            padding-bottom: max(12px, env(safe-area-inset-bottom));
          }
        }

        /* Increased font size for mobile */
        @media (max-width: 768px) {
          body {
            font-size: 16px;
          }
          
          h1 { font-size: 24px; }
          h2 { font-size: 20px; }
          h3 { font-size: 18px; }
        }

        /* Smooth orientation change */
        body {
          transition: 100ms linear orientation;
        }
      `;
      document.head.appendChild(style);
    }
  }

  setupSwipeNavigation() {
    if (!this.prefs.get('swipeEnabled')) return;

    this.swipeDetector = new SwipeDetector(
      document.body,
      (direction) => this.handleSwipe(direction),
      this.prefs
    );
  }

  handleSwipe(direction) {
    // Access the global PAGES and navigate function
    if (typeof PAGES === 'undefined' || typeof navigate === 'undefined') {
      console.warn('Global PAGES or navigate not found');
      return;
    }

    const currentPage = document.querySelector('[data-page].active')?.dataset.page ||
                       (typeof window.currentPage !== 'undefined' ? window.currentPage : 'chat');
    const currentIndex = PAGES.indexOf(currentPage);

    if (currentIndex === -1) return;

    let nextIndex;
    if (direction === 'left') {
      // Swipe left → next page
      nextIndex = (currentIndex + 1) % PAGES.length;
    } else {
      // Swipe right → previous page
      nextIndex = (currentIndex - 1 + PAGES.length) % PAGES.length;
    }

    const nextPage = PAGES[nextIndex];
    this.vibration?.light();
    navigate(nextPage);
  }

  setupPullToRefresh() {
    if (!this.prefs.get('pullToRefreshEnabled')) return;

    this.pullToRefreshDetector = new PullToRefreshDetector(
      document.body,
      () => this.handlePullToRefresh(),
      this.prefs,
      this.vibration
    );
  }

  async handlePullToRefresh() {
    const currentPage = document.querySelector('[data-page].active')?.dataset.page ||
                       (typeof window.currentPage !== 'undefined' ? window.currentPage : 'chat');

    try {
      // Call appropriate refresh function for current page
      if (currentPage === 'dashboard' && typeof loadDashboard === 'function') {
        await loadDashboard();
      } else if (currentPage === 'memory' && typeof loadMemory === 'function') {
        await loadMemory();
      } else if (currentPage === 'tools' && typeof loadTools === 'function') {
        await loadTools();
      } else if (currentPage === 'canvas' && typeof loadCanvas === 'function') {
        await loadCanvas();
      } else if (typeof window.onPageRefresh === 'function') {
        await window.onPageRefresh(currentPage);
      }

      this.vibration?.light();
    } catch (error) {
      console.error('Pull-to-refresh error:', error);
      this.vibration?.strong();
    }
  }

  setupLongPress() {
    if (!this.prefs.get('longPressEnabled')) return;

    this.longPressDetector = new LongPressDetector(this.prefs, this.vibration);

    // Listen for context menu actions
    document.addEventListener('contextmenu-action', (e) => {
      const { action, element } = e.detail;
      this.handleContextMenuAction(action, element);
    });
  }

  handleContextMenuAction(action, element) {
    const itemText = element.textContent || element.innerText || '';

    switch (action) {
      case 'copy':
        navigator.clipboard.writeText(itemText).then(() => {
          this.showNotification('Copied to clipboard');
          this.vibration?.light();
        });
        break;

      case 'edit':
        const editEvent = new CustomEvent('item-edit', { detail: { element } });
        document.dispatchEvent(editEvent);
        this.vibration?.light();
        break;

      case 'delete':
        const deleteEvent = new CustomEvent('item-delete', { detail: { element } });
        document.dispatchEvent(deleteEvent);
        this.vibration?.medium();
        break;

      case 'share':
        if (navigator.share) {
          navigator.share({
            title: 'Gravity Claw',
            text: itemText,
          }).catch(err => console.debug('Share cancelled:', err.message));
        } else {
          this.showNotification('Share not supported on this device');
        }
        this.vibration?.light();
        break;
    }
  }

  setupPinchZoom() {
    if (!this.prefs.get('pinchZoomEnabled')) return;
    this.pinchZoomDetector = new PinchZoomDetector(this.prefs, this.vibration);
  }

  setupKeyboardFallback() {
    // Arrow keys for navigation
    document.addEventListener('keydown', (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.handleSwipe('right');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.handleSwipe('left');
      } else if (e.key === 'r' && e.ctrlKey) {
        e.preventDefault();
        this.handlePullToRefresh();
      }
    });
  }

  setupPWA() {
    this.registerServiceWorker();
    this.setupInstallPrompt();
  }

  async registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });
      console.debug('Service Worker registered:', registration);
    } catch (error) {
      console.debug('Service Worker registration failed:', error.message);
    }
  }

  setupInstallPrompt() {
    let deferredPrompt = null;

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      this.showInstallPrompt(deferredPrompt);
    });

    window.addEventListener('appinstalled', () => {
      console.debug('PWA installed');
      deferredPrompt = null;
    });
  }

  showInstallPrompt(deferredPrompt) {
    // Create install button if it doesn't exist
    let installBtn = document.getElementById('install-pwa-btn');
    if (!installBtn) {
      installBtn = document.createElement('button');
      installBtn.id = 'install-pwa-btn';
      installBtn.textContent = '📲 Install App';
      installBtn.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 20px;
        background: var(--accent);
        color: white;
        border: none;
        border-radius: 24px;
        cursor: pointer;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        z-index: 1001;
        animation: slideUp 0.3s ease-out;
      `;

      const style = document.createElement('style');
      if (!document.getElementById('install-btn-animation')) {
        style.id = 'install-btn-animation';
        style.textContent = `
          @keyframes slideUp {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `;
        document.head.appendChild(style);
      }

      document.body.appendChild(installBtn);
    }

    installBtn.style.display = 'block';
    installBtn.onclick = async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.debug('User response:', outcome);
        installBtn.style.display = 'none';
        deferredPrompt = null;
      }
    };

    // Auto-hide after 10 seconds
    setTimeout(() => {
      if (installBtn && installBtn.style.display !== 'none') {
        installBtn.style.animation = 'slideUp 0.3s ease-out reverse';
        setTimeout(() => {
          installBtn.style.display = 'none';
        }, 300);
      }
    }, 10000);
  }

  showNotification(message, duration = 2000) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--surface2);
      color: var(--text);
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      z-index: 1000;
      animation: slideUp 0.3s ease-out;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideUp 0.3s ease-out reverse';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // Public API
  getPreferences() {
    return this.prefs.prefs;
  }

  setPreference(key, value) {
    this.prefs.set(key, value);
  }

  resetPreferences() {
    this.prefs.reset();
  }

  isSupported() {
    return this.touchSupported;
  }

  destroy() {
    this.swipeDetector?.detach();
    this.pullToRefreshDetector?.detach();
    this.longPressDetector?.detach();
    this.pinchZoomDetector?.detach();
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Export for global use
// ═════════════════════════════════════════════════════════════════════════════

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TouchGestureManager, GESTURE_CONFIG };
}
