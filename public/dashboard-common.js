// ========================================
// Dashboard Common - Shared Logic & Navigation
// Handles routing, WebSocket, state management
// ========================================

// ========== Configuration ==========
const CONFIG = {
    wsReconnectDelay: 3000,
    wsMaxReconnectDelay: 30000,
    wsReconnectAttempts: 0,
    sessionRefreshInterval: 1000,
    defaultPage: 'settings'
};

// ========== State Management ==========
const state = {
    ws: null,
    connected: false,
    currentPage: null,
    sessionId: null,
    sessionStartTime: null,
    uptimeInterval: null,
    pages: {}
};

// ========== DOM Elements ==========
const elements = {
    navButtons: document.querySelectorAll('[data-page]'),
    breadcrumbPage: document.getElementById('breadcrumb-page'),
    pageTitle: document.getElementById('page-title'),
    pageDescription: document.getElementById('page-description'),
    headerActions: document.getElementById('header-actions'),
    dashboardBody: document.getElementById('dashboard-body'),
    wsStatus: document.getElementById('ws-status'),
    statusDot: document.getElementById('status-dot'),
    sessionIdEl: document.getElementById('session-id'),
    sessionUptimeEl: document.getElementById('session-uptime'),
    toastContainer: document.getElementById('toast-container'),
    themeToggle: document.getElementById('theme-toggle')
};

// ========== Initialization ==========
function init() {
    console.log('🚀 Initializing Gravity Claw Dashboard...');

    // Setup navigation
    setupNavigation();

    // Setup theme toggle
    setupThemeToggle();

    // Connect WebSocket
    connectWebSocket();

    // Start session timer
    startSessionTimer();

    // Handle initial route
    handleRoute();

    // Listen for hash changes
    window.addEventListener('hashchange', handleRoute);

    // Keyboard shortcuts
    setupKeyboardShortcuts();

    // Setup global error handlers
    setupErrorHandlers();

    console.log('✅ Dashboard initialized');
}

// ========== Error Handling System ==========
function setupErrorHandlers() {
    // Global error handler for uncaught JavaScript errors
    window.addEventListener('error', (event) => {
        console.error('🔥 Global Error:', event.error);
        logError('Global Error', event.error);
        showToast('An unexpected error occurred', 'error');
        event.preventDefault();
    });

    // Promise rejection handler
    window.addEventListener('unhandledrejection', (event) => {
        console.error('🔥 Unhandled Promise Rejection:', event.reason);
        logError('Unhandled Rejection', event.reason);
        showToast('Operation failed unexpectedly', 'error');
        event.preventDefault();
    });
}

/**
 * Log error to console with structured format
 */
function logError(context, error) {
    const errorLog = {
        timestamp: new Date().toISOString(),
        context,
        message: error?.message || String(error),
        stack: error?.stack,
        url: window.location.href,
        userAgent: navigator.userAgent
    };

    console.error('📋 Error Log:', errorLog);

    // In production, send to error tracking service
    // sendToErrorTracking(errorLog);
}

/**
 * Wrap async functions with error boundary
 */
function withErrorBoundary(fn, context = 'Operation') {
    return async function (...args) {
        try {
            return await fn.apply(this, args);
        } catch (error) {
            console.error(`Error in ${context}:`, error);
            logError(context, error);
            showError(context, error.message);
            throw error; // Re-throw for caller to handle if needed
        }
    };
}

/**
 * Retry failed operations with exponential backoff
 */
async function retryOperation(operation, maxRetries = 3, baseDelay = 1000) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            if (attempt === maxRetries - 1) {
                throw error; // Final attempt failed
            }

            const delay = baseDelay * Math.pow(2, attempt);
            console.warn(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// ========== Navigation System ==========
function setupNavigation() {
    elements.navButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const page = btn.getAttribute('data-page');
            if (page) {
                navigateTo(page);
            }
        });
    });
}

function navigateTo(page) {
    window.location.hash = `#/${page}`;
}

function handleRoute() {
    const hash = window.location.hash.slice(2) || CONFIG.defaultPage; // Remove '#/'
    loadPage(hash);
}

function loadPage(pageName) {
    if (state.currentPage === pageName) return;

    console.log(`📄 Loading page: ${pageName}`);
    state.currentPage = pageName;

    // Update active nav item
    elements.navButtons.forEach(btn => {
        const isActive = btn.getAttribute('data-page') === pageName;
        btn.classList.toggle('active', isActive);
        if (isActive) {
            btn.setAttribute('aria-current', 'page');
        } else {
            btn.removeAttribute('aria-current');
        }
    });

    // Load page content
    loadPageContent(pageName);
}

async function loadPageContent(pageName) {
    const pageConfig = getPageConfig(pageName);

    // Update header
    elements.breadcrumbPage.textContent = pageConfig.title;
    elements.pageTitle.textContent = pageConfig.title;
    elements.pageDescription.textContent = pageConfig.description;

    // Update document title
    document.title = `${pageConfig.title} | Gravity Claw`;

    // Clear header actions
    elements.headerActions.innerHTML = '';

    // Show loading state
    showLoading();

    try {
        // Load page-specific script if exists
        const loaderName = `load${pageName.charAt(0).toUpperCase() + pageName.slice(1)}Page`;
        const loader = window[loaderName];

        if (typeof loader === 'function') {
            await loader();
        } else {
            console.warn(`Loader ${loaderName} not found, showing placeholder`);
            showPlaceholder(pageName);
        }
    } catch (error) {
        console.error(`Error loading page ${pageName}:`, error);
        showError(`Failed to load ${pageConfig.title}`, error.message);
    }
}

function getPageConfig(pageName) {
    const configs = {
        settings: {
            title: 'Settings',
            description: 'Configure your Gravity Claw preferences and integrations'
        },
        analytics: {
            title: 'Analytics',
            description: 'Monitor usage, costs, and performance metrics'
        },
        admin: {
            title: 'Admin Panel',
            description: 'Manage groups, permissions, and tool access controls'
        },
        plugins: {
            title: 'MCP Plugins',
            description: 'Install and manage Model Context Protocol plugins'
        },
        memory: {
            title: 'Memory Vault',
            description: 'Explore saved facts, entities, and knowledge relationships'
        }
    };

    return configs[pageName] || configs[CONFIG.defaultPage];
}

// Page loaders are defined in their respective files (pages/*.js)


function showPlaceholder(pageName) {
    const config = getPageConfig(pageName);
    elements.dashboardBody.innerHTML = `
        <div class="dashboard-section">
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <h3>${config.title}</h3>
                <p>${config.description}</p>
                <p style="margin-top: 16px; opacity: 0.7;">This feature is under development</p>
            </div>
        </div>
    `;
}

// ========== Timestamped Logging ==========
function log(msg) {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    console.log(`[${hh}:${mm}:${ss}] ${msg}`);
}

// ========== WebSocket Connection ==========
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    log(`🔗 Attempting WebSocket connection to ${wsUrl}...`);

    try {
        log(`📍 Creating WebSocket object...`);
        state.ws = new WebSocket(wsUrl);
        log(`✓ WebSocket object created successfully`);

        state.ws.onopen = () => {
            log('✅ WebSocket connected and ready for communication');
            CONFIG.wsReconnectAttempts = 0; // Reset reconnect counter on successful connection
            updateConnectionStatus(true);
            showToast('Connected to Gravity Claw', 'success');
        };

        state.ws.onclose = () => {
            log('❌ WebSocket disconnected (connection closed)');
            updateConnectionStatus(false);
            scheduleReconnect();
        };

        state.ws.onerror = (error) => {
            log(`⚠️ WebSocket error: ${error.message || JSON.stringify(error)}`);
            logError('WebSocket Error', error);
            updateConnectionStatus(false);
        };

        state.ws.onmessage = (event) => {
            log(`📨 WebSocket message received (size: ${event.data.length} bytes)`);
            handleWebSocketMessage(event);
        };
    } catch (error) {
        log(`❌ Failed to create WebSocket: ${error.message || JSON.stringify(error)}`);
        updateConnectionStatus(false);
        scheduleReconnect();
    }
}

function updateConnectionStatus(connected) {
    state.connected = connected;
    elements.wsStatus.textContent = connected ? 'Connected' : 'Disconnected';
    elements.statusDot.style.background = connected ? 'var(--success)' : 'var(--error)';
}

function scheduleReconnect() {
    CONFIG.wsReconnectAttempts++;

    // Exponential backoff: 3s, 6s, 12s, 24s, 30s (max)
    const delay = Math.min(
        CONFIG.wsReconnectDelay * Math.pow(2, CONFIG.wsReconnectAttempts - 1),
        CONFIG.wsMaxReconnectDelay
    );

    const attemptText = CONFIG.wsReconnectAttempts > 1 ? ` (attempt ${CONFIG.wsReconnectAttempts})` : '';
    console.log(`⏳ Reconnecting in ${delay}ms${attemptText}...`);

    if (CONFIG.wsReconnectAttempts <= 3) {
        showToast(`Reconnecting${attemptText}...`, 'warning');
    }

    setTimeout(connectWebSocket, delay);
}

function handleWebSocketMessage(event) {
    try {
        const data = JSON.parse(event.data);
        console.log('📨 WebSocket message:', data);

        // Handle different message types
        switch (data.type) {
            case 'session_info':
                handleSessionInfo(data);
                break;
            case 'error':
                logError('WebSocket Message Error', new Error(data.message));
                showToast(data.message || 'An error occurred', 'error');
                break;
            case 'tool_response':
                handleToolResponse(data);
                break;
            default:
                console.log('Unhandled message type:', data.type);
        }
    } catch (error) {
        console.error('Error parsing WebSocket message:', error);
        logError('WebSocket Parsing Error', error);
    }
}

function handleSessionInfo(data) {
    state.sessionId = data.sessionId || 'Unknown';
    state.sessionStartTime = data.startTime ? new Date(data.startTime) : new Date();
    elements.sessionIdEl.textContent = state.sessionId.substring(0, 8) + '...';
}

function handleToolResponse(data) {
    console.log('🔧 Tool response received:', data);
    // Handle tool responses if needed
    // This can be extended to support callbacks or promises
}

// ========== Tool Communication ==========
async function callTool(toolName, args = {}) {
    if (!state.connected) {
        showToast('Not connected to server', 'error');
        throw new Error('WebSocket not connected');
    }

    return new Promise((resolve, reject) => {
        const messageId = Math.random().toString(36).substring(7);

        // Send message
        state.ws.send(JSON.stringify({
            type: 'tool_call',
            id: messageId,
            tool: toolName,
            args: args
        }));

        // Wait for response (simplified - should use proper message handling)
        const timeout = setTimeout(() => {
            reject(new Error('Tool call timeout'));
        }, 10000);

        const handler = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.id === messageId) {
                    clearTimeout(timeout);
                    state.ws.removeEventListener('message', handler);

                    if (data.error) {
                        reject(new Error(data.error));
                    } else {
                        resolve(data.result);
                    }
                }
            } catch (e) {
                // Ignore parse errors from other messages
            }
        };

        state.ws.addEventListener('message', handler);
    });
}

// ========== Session Timer ==========
function startSessionTimer() {
    if (!state.sessionStartTime) {
        state.sessionStartTime = new Date();
    }

    state.uptimeInterval = setInterval(updateUptime, 1000);
    updateUptime();
}

function updateUptime() {
    if (!state.sessionStartTime) return;

    const now = new Date();
    const diff = now - state.sessionStartTime;

    const hours = Math.floor(diff / 3600000).toString().padStart(2, '0');
    const minutes = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
    const seconds = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');

    elements.sessionUptimeEl.textContent = `${hours}:${minutes}:${seconds}`;
}

// ========== UI Helpers ==========
function showLoading() {
    elements.dashboardBody.innerHTML = `
    <div class="loading-state">
        <svg class="spinner" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" opacity="0.25"></circle>
            <path d="M12 2a10 10 0 0 1 10 10" opacity="0.75"></path>
        </svg>
        <p>Loading...</p>
    </div>
`;
}

function showError(title, message) {
    elements.dashboardBody.innerHTML = `
    <div class="error-state">
        <h4>${title}</h4>
        <p>${message}</p>
    </div>
`;
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: var(--bg-card);
    border: 1px solid var(--border-dim);
    border-radius: var(--radius-md);
    padding: 16px 20px;
    box-shadow: var(--shadow-lg);
    max-width: 400px;
    z-index: 1000;
    animation: slideIn 0.3s ease-out;
`;

    const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
    const color = type === 'success' ? 'var(--success)' : type === 'error' ? 'var(--error)' : 'var(--accent)';

    toast.innerHTML = `
    <div style="display: flex; align-items: center; gap: 12px;">
        <span style="font-size: 1.25rem; color: ${color};">${icon}</span>
        <span style="color: var(--text-primary);">${message}</span>
    </div>
`;

    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ========== Theme Toggle ==========
function setupThemeToggle() {
    const currentTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', currentTheme);
    updateThemeIcon(currentTheme);

    if (elements.themeToggle) {
        elements.themeToggle.addEventListener('click', toggleTheme);
    }
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = current === 'dark' ? 'light' : 'dark';

    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);

    showToast(`Switched to ${newTheme} theme`, 'success');
}

function updateThemeIcon(theme) {
    if (!elements.themeToggle) return;

    const svg = elements.themeToggle.querySelector('svg');
    if (!svg) return;

    // Show sun icon in dark mode (to switch to light), moon icon in light mode (to switch to dark)
    if (theme === 'dark') {
        svg.innerHTML = '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>';
        elements.themeToggle.setAttribute('aria-label', 'Switch to light theme');
    } else {
        svg.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';
        elements.themeToggle.setAttribute('aria-label', 'Switch to dark theme');
    }
}

// ========== Keyboard Shortcuts ==========
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Cmd/Ctrl + K - Command palette (future)
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            showToast('Command palette coming soon', 'info');
        }

        // Cmd/Ctrl + , - Settings
        if ((e.metaKey || e.ctrlKey) && e.key === ',') {
            e.preventDefault();
            navigateTo('settings');
        }

        // Cmd/Ctrl + / - Show shortcuts help
        if ((e.metaKey || e.ctrlKey) && e.key === '/') {
            e.preventDefault();
            if (typeof showShortcutsModal === 'function') {
                showShortcutsModal();
            }
        }

        // Cmd/Ctrl + / - Help
        if ((e.metaKey || e.ctrlKey) && e.key === '/') {
            e.preventDefault();
            showToast('Keyboard shortcuts: Cmd+, (Settings), Cmd+Shift+A (Analytics)', 'info');
        }

        // Cmd/Ctrl + Shift + A - Analytics
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'A') {
            e.preventDefault();
            navigateTo('analytics');
        }
    });
}

// ========== Global Exports ==========
window.dashboard = {
    callTool,
    showToast,
    showLoading,
    showError,
    navigateTo,
    state,
    // Error handling utilities
    logError,
    withErrorBoundary,
    retryOperation
};

// ========== Add animations to CSS ==========
(() => {
const style = document.createElement('style');
style.textContent = `
@keyframes slideIn {
    from {
        transform: translateX(100%);
        opacity: 0;
    }
    to {
        transform: translateX(0);
        opacity: 1;
    }
}

@keyframes slideOut {
    from {
        transform: translateX(0);
        opacity: 1;
    }
    to {
        transform: translateX(100%);
        opacity: 0;
    }
}
`;
document.head.appendChild(style);
})();

// ========== Initialize on DOM ready ==========
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
