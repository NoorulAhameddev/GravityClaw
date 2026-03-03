// ========== DOM Elements ==========
const chatHistory = document.getElementById('chat-history');
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');
const statusIndicator = document.getElementById('model-dropdown');
const typingIndicator = document.getElementById('typing-indicator');
const dashboard = document.getElementById('main-dashboard');
const historyList = document.getElementById('history-list');
const toastContainer = document.getElementById('toast-container');
const sendBtn = document.getElementById('send-btn');

// ========== State Management ==========
let ws;
let connectRetryTimeout;
let typingTimeout;
let messageHistory = [];
let historyIndex = -1;

const BOT_HEADER_NAME = 'Gravity Claw';
const BOT_LOGO_SVG = `<svg class="bot-logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg>`;

// ========== Connection Management ==========
function connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('🔗 Connected to Gravity Claw');
        if (connectRetryTimeout) clearTimeout(connectRetryTimeout);
        updateConnectionStatus(true);
        announceToAccessibility('Connected to Gravity Claw');
    };

    ws.onclose = () => {
        updateConnectionStatus(false);
        scheduleReconnect();
        announceToAccessibility('Disconnected. Reconnecting...');
    };

    ws.onerror = (error) => {
        console.error('❌ WebSocket error', error);
        showToast('Connection error. Attempting to reconnect...', 'error');
        announceToAccessibility('Connection error occurred');
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);

            if (data.type === 'typing') {
                showTypingIndicator();
            } else if (data.type === 'message') {
                hideTypingIndicator();
                addMessage(data.text, 'bot');
                announceToAccessibility(`Bot responded: ${data.text.substring(0, 100)}`);
            } else if (data.type === 'error') {
                hideTypingIndicator();
                showToast(data.text || 'An error occurred', 'error');
                announceToAccessibility(`Error: ${data.text}`);
            }
        } catch (e) {
            console.error('Error parsing message', e);
        }
    };
}

function updateConnectionStatus(connected) {
    const statusText = connected ? 'Gravity Claw Core (Connected)' : 'Connecting...';
    statusIndicator.querySelector('span').textContent = statusText;
    statusIndicator.style.borderColor = connected ? 'rgba(99, 102, 241, 0.4)' : 'rgba(239, 68, 68, 0.3)';
    sendBtn.disabled = !connected;
}

function scheduleReconnect() {
    updateConnectionStatus(false);
    if (connectRetryTimeout) clearTimeout(connectRetryTimeout);
    connectRetryTimeout = setTimeout(connect, 3000);
}

// ========== Typing Indicator ==========
function showTypingIndicator() {
    typingIndicator.classList.remove('hidden');
    scrollToBottom();
    if (typingTimeout) clearTimeout(typingTimeout);
    typingTimeout = setTimeout(hideTypingIndicator, 10000);
}

function hideTypingIndicator() {
    typingIndicator.classList.add('hidden');
    if (typingTimeout) clearTimeout(typingTimeout);
}

function addMessage(text, sender) {
    // Update dashboard state
    if (!dashboard.classList.contains('has-content')) {
        dashboard.classList.add('has-content');
        updateSidebarHistory(text);
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;
    messageDiv.setAttribute('role', 'article');
    
    if (sender === 'user') {
        messageDiv.setAttribute('aria-label', `Your message: ${text}`);
    }

    // Bot header with logo
    if (sender === 'bot') {
        const header = document.createElement('div');
        header.className = 'bot-header';
        header.innerHTML = `${BOT_LOGO_SVG} <span class="bot-name">${BOT_HEADER_NAME}</span>`;
        messageDiv.appendChild(header);
    }

    // Message content
    const contentDiv = document.createElement('div');
    contentDiv.className = 'msg-content';

    if (sender === 'bot') {
        // Display tool execution status
        if (text.includes('Tool Call:') || text.includes('Recalling') || text.includes('Executing')) {
            const visualizer = document.createElement('div');
            visualizer.className = 'tool-visualizer';
            visualizer.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg> <span>Processing execution...</span>`;
            messageDiv.appendChild(visualizer);
        }
        
        // Parse and render markdown
        contentDiv.innerHTML = marked.parse(text);
        contentDiv.setAttribute('role', 'region');
        contentDiv.setAttribute('aria-label', 'Bot message content');

        // Enhance code blocks with copy functionality
        setTimeout(() => enhanceCodeBlocks(messageDiv), 10);
    } else {
        // User message - plain text
        contentDiv.textContent = text;
    }

    messageDiv.appendChild(contentDiv);

    // Status banner for bot messages
    if (sender === 'bot') {
        const statusBanner = document.createElement('div');
        statusBanner.className = 'status-banner';
        statusBanner.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg> <span>Action processed</span>`;
        messageDiv.appendChild(statusBanner);
    }

    chatHistory.appendChild(messageDiv);
    setTimeout(scrollToBottom, 50);
}

function enhanceCodeBlocks(container) {
    container.querySelectorAll('pre').forEach(pre => {
        if (pre.querySelector('.code-header')) return;

        const header = document.createElement('div');
        header.className = 'code-header';

        const code = pre.querySelector('code');
        const lang = code.className.replace('language-', '') || 'code';

        header.innerHTML = `
            <span>${lang}</span>
            <button class="copy-btn" onclick="copyCode(this)">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                Copy
            </button>
        `;

        pre.prepend(header);
    });
}

window.copyCode = function (btn) {
    const code = btn.parentElement.nextElementSibling.innerText;
    navigator.clipboard.writeText(code).then(() => {
        const original = btn.innerHTML;
        btn.innerHTML = 'Copied!';
        btn.style.color = 'var(--success)';
        setTimeout(() => {
            btn.innerHTML = original;
            btn.style.color = '';
        }, 2000);
    });
};

function showFollowUps(botResponse) {
    // Remove existing follow-ups
    const oldFollowUps = document.querySelector('.follow-ups');
    if (oldFollowUps) oldFollowUps.remove();

    const container = document.createElement('div');
    container.className = 'follow-ups';

    container.innerHTML = `
        <div class="follow-ups-title">Refine Action</div>
        <div class="follow-up-divider"></div>
        <div class="follow-up-item" onclick="prefill('Show me all your connected MCP tools.')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg>
            <span class="follow-up-text">List MCP Tools</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
        </div>
        <div class="follow-up-item" onclick="prefill('Recall my latest project status from memory.')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
            <span class="follow-up-text">Recall Memory</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
        </div>
    `;

    chatHistory.appendChild(container);
    setTimeout(scrollToBottom, 50);
}

function updateSidebarHistory(firstMessage) {
    const item = document.createElement('button');
    item.className = 'nav-item active';
    item.style.marginTop = '4px';
    item.setAttribute('data-history-item', 'true');
    const truncated = firstMessage.length > 25 ? firstMessage.substring(0, 22) + '...' : firstMessage;
    item.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        <span>${sanitizeHTML(truncated)}</span>
    `;
    item.setAttribute('title', firstMessage);
    item.setAttribute('aria-label', `History: ${firstMessage}`);
    historyList.innerHTML = '';
    historyList.appendChild(item);
}

function sanitizeHTML(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function scrollToBottom() {
    dashboard.scrollTo({
        top: dashboard.scrollHeight,
        behavior: 'smooth'
    });
}

function prefill(text) {
    messageInput.value = text;
    messageInput.focus();
    autoResize();

    // Remove follow-ups when user clicks one
    const followUps = document.querySelector('.follow-ups');
    if (followUps) followUps.remove();
}

function autoResize() {
    messageInput.style.height = 'auto';
    messageInput.style.height = (messageInput.scrollHeight) + 'px';
}

messageInput.addEventListener('input', autoResize);

chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = messageInput.value.trim();

    if (!text) {
        announceToAccessibility('Please enter a message');
        return;
    }

    if (!ws || ws.readyState !== WebSocket.OPEN) {
        showToast('Not connected to server', 'error');
        announceToAccessibility('Cannot send message: not connected');
        return;
    }

    try {
        ws.send(JSON.stringify({
            type: 'message',
            text: text
        }));

        addMessage(text, 'user');
        messageHistory.push(text);
        historyIndex = -1;
        messageInput.value = '';
        autoResize();

        const followUps = document.querySelector('.follow-ups');
        if (followUps) followUps.remove();
    } catch (err) {
        console.error('Error sending message:', err);
        showToast('Failed to send message', 'error');
    }
});

messageInput.addEventListener('keydown', (e) => {
    // Send on Enter (Shift+Enter for new line)
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        chatForm.dispatchEvent(new Event('submit'));
    }
    
    // Command history navigation
    if (e.key === 'ArrowUp' && messageInput.value === '') {
        e.preventDefault();
        if (historyIndex < messageHistory.length - 1) {
            historyIndex++;
            messageInput.value = messageHistory[messageHistory.length - 1 - historyIndex];
            autoResize();
        }
    } else if (e.key === 'ArrowDown' && messageInput.value === '') {
        e.preventDefault();
        if (historyIndex > 0) {
            historyIndex--;
            messageInput.value = messageHistory[messageHistory.length - 1 - historyIndex];
            autoResize();
        } else if (historyIndex === 0) {
            historyIndex = -1;
            messageInput.value = '';
            autoResize();
        }
    }
});

// ========== UI Utilities ==========
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 20px;
        background: ${type === 'error' ? '#ef4444' : type === 'warning' ? '#f59e0b' : '#10b981'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        z-index: 1000;
        animation: slideInToast 0.3s ease-out;
        font-size: 0.9rem;
    `;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOutToast 0.3s ease-out forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function announceToAccessibility(message) {
    const announcement = document.createElement('div');
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'polite');
    announcement.setAttribute('aria-atomic', 'true');
    announcement.style.cssText = 'position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden;';
    announcement.textContent = message;
    document.body.appendChild(announcement);
    setTimeout(() => announcement.remove(), 3000);
}

// ========== Navigation ==========
document.querySelectorAll('[data-section]').forEach(button => {
    button.addEventListener('click', () => {
        document.querySelectorAll('[data-section]').forEach(b => b.classList.remove('active'));
        button.classList.add('active');
        const section = button.getAttribute('data-section');
        announceToAccessibility(`Navigated to ${section}`);
        if (section !== 'chat') {
            showToast(`${section} section coming soon!`, 'info');
        }
    });
});

marked.setOptions({
    breaks: true,
    gfm: true,
    pedantic: false
});

console.log('🚀 Gravity Claw Interface Ready');
window.prefill = prefill;
connect();
announceToAccessibility('Gravity Claw Agentic Interface loaded. Type a message or use quick actions.');
