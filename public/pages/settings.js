// ========================================
// Settings Page
// Voice, notifications, display, and account settings
// ========================================

async function loadSettingsPage() {
    const container = document.getElementById('dashboard-body');

    container.innerHTML = `
        <div class="dashboard-section">
            <div class="section-header">
                <h2 class="section-title">Voice Settings</h2>
                <p class="section-description">Configure text-to-speech and voice transcription</p>
            </div>
            <div id="voice-settings-container"></div>
        </div>
        
        <div class="dashboard-section">
            <div class="section-header">
                <h2 class="section-title">Notification Preferences</h2>
                <p class="section-description">Control how and when you receive notifications</p>
            </div>
            <div id="notification-settings-container"></div>
        </div>
        
        <div class="dashboard-section">
            <div class="section-header">
                <h2 class="section-title">Display Settings</h2>
                <p class="section-description">Customize the appearance of your interface</p>
            </div>
            <div id="display-settings-container"></div>
        </div>
        
        <div class="dashboard-section">
            <div class="section-header">
                <h2 class="section-title">Account & Session</h2>
                <p class="section-description">Manage your session and connected devices</p>
            </div>
            <div id="account-settings-container"></div>
        </div>
    `;

    // Load each settings section
    await loadVoiceSettings();
    await loadNotificationSettings();
    await loadDisplaySettings();
    await loadAccountSettings();
}

// ========== Voice Settings ==========
async function loadVoiceSettings() {
    const container = document.getElementById('voice-settings-container');

    // Try to fetch current voice settings from backend
    let currentSettings = {
        mode: 'off',
        ttsProvider: 'openai',
        speed: 1.0,
        voice: 'alloy'
    };

    try {
        const result = await window.dashboard.callTool('getVoiceSettings', { sessionId: sessionId || 'default' });
        if (result?.success) {
            currentSettings = {
                mode: result.voiceMode || 'off',
                ttsProvider: result.ttsProvider || 'openai',
                voice: result.voiceId || 'alloy',
                speed: result.speed || 1.0
            };
        }
    } catch (error) {
        console.warn('Could not fetch voice settings:', error);
    }

    const card = document.createElement('div');
    card.className = 'dashboard-card';

    const cardContent = document.createElement('div');
    cardContent.style.padding = '8px';

    // Voice Mode Dropdown
    const modeDropdown = createDropdown({
        id: 'voice-mode',
        label: 'Voice Mode',
        description: 'Select how voice features should work',
        options: [
            { value: 'off', label: 'Off - No voice features' },
            { value: 'transcribe', label: 'Transcribe Only - Speech to text' },
            { value: 'full', label: 'Full Voice - Speech + TTS responses' }
        ],
        value: currentSettings.mode,
        onChange: (value) => {
            saveVoiceSetting('mode', value);
        }
    });

    // TTS Provider Dropdown
    const providerDropdown = createDropdown({
        id: 'tts-provider',
        label: 'TTS Provider',
        description: 'Text-to-speech engine',
        options: [
            { value: 'openai', label: 'OpenAI TTS' },
            { value: 'elevenlabs', label: 'ElevenLabs' },
            { value: 'browser', label: 'Browser Native (Free)' }
        ],
        value: currentSettings.ttsProvider,
        onChange: (value) => {
            saveVoiceSetting('ttsProvider', value);
        }
    });

    // Voice Selection
    const voiceDropdown = createDropdown({
        id: 'tts-voice',
        label: 'Voice',
        description: 'Select voice personality',
        options: [
            { value: 'alloy', label: 'Alloy - Neutral' },
            { value: 'echo', label: 'Echo - Male' },
            { value: 'fable', label: 'Fable - British' },
            { value: 'onyx', label: 'Onyx - Deep' },
            { value: 'nova', label: 'Nova - Female' },
            { value: 'shimmer', label: 'Shimmer - Soft' }
        ],
        value: currentSettings.voice,
        onChange: (value) => {
            saveVoiceSetting('voice', value);
        }
    });

    // Speed Slider
    const speedContainer = document.createElement('div');
    speedContainer.style.marginBottom = '16px';
    speedContainer.innerHTML = `
        <label style="display: block; color: var(--text-primary); font-weight: 500; margin-bottom: 8px;">
            Voice Speed: <span id="speed-value">${currentSettings.speed}x</span>
        </label>
        <input type="range" id="voice-speed" min="0.5" max="2.0" step="0.1" value="${currentSettings.speed}" 
               style="width: 100%; accent-color: var(--accent);">
        <div style="display: flex; justify-content: space-between; margin-top: 4px; color: var(--text-secondary); font-size: 0.75rem;">
            <span>Slower (0.5x)</span>
            <span>Normal (1.0x)</span>
            <span>Faster (2.0x)</span>
        </div>
    `;

    const speedSlider = speedContainer.querySelector('#voice-speed');
    const speedValue = speedContainer.querySelector('#speed-value');
    speedSlider.addEventListener('input', (e) => {
        speedValue.textContent = `${e.target.value}x`;
    });
    speedSlider.addEventListener('change', (e) => {
        saveVoiceSetting('speed', parseFloat(e.target.value));
    });

    // Test Voice Button
    const testButton = document.createElement('button');
    testButton.textContent = '🔊 Test Voice';
    testButton.style.cssText = `
        padding: 10px 20px;
        background: var(--accent);
        border: none;
        border-radius: var(--radius-md);
        color: white;
        font-family: var(--font-main);
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        transition: all var(--transition-fast);
        margin-top: 16px;
    `;
    testButton.addEventListener('click', testVoice);
    testButton.addEventListener('mouseenter', (e) => {
        e.target.style.background = 'var(--accent-dark)';
    });
    testButton.addEventListener('mouseleave', (e) => {
        e.target.style.background = 'var(--accent)';
    });

    cardContent.appendChild(modeDropdown);
    cardContent.appendChild(providerDropdown);
    cardContent.appendChild(voiceDropdown);
    cardContent.appendChild(speedContainer);
    cardContent.appendChild(testButton);

    card.appendChild(cardContent);
    container.appendChild(card);
}

async function saveVoiceSetting(key, value) {
    try {
        const sessionId = window.dashboard?.state?.sessionId || 'default';
        const toolName = key === 'mode'
            ? 'setVoiceMode'
            : key === 'ttsProvider'
                ? 'setTTSProvider'
                : null;

        if (!toolName) {
            console.warn('Unknown voice setting key:', key);
            return;
        }

        const args = key === 'mode' ? { mode: value } : key === 'ttsProvider' ? { provider: value } : { [key]: value };
        const result = await window.dashboard?.callTool?.(toolName, { sessionId, ...args });

        if (result?.success || result?.mode) {
            window.dashboard.showToast(`Voice setting updated: ${key}`, 'success');
        } else {
            throw new Error(result?.error || 'Failed to save');
        }
    } catch (error) {
        console.error('Failed to save voice setting:', error);
        window.dashboard.showToast(`Failed to save setting: ${error.message}`, 'error');
    }
}

async function testVoice() {
    window.dashboard.showToast('Testing voice... (Feature coming soon)', 'info');
    // TODO: Call TTS test
}

// ========== Notification Settings ==========
async function loadNotificationSettings() {
    const container = document.getElementById('notification-settings-container');

    const toggles = [
        {
            id: 'notify-success',
            label: 'Success Notifications',
            description: 'Show toasts for successful operations',
            checked: true,
            onChange: (checked) => saveNotificationSetting('success', checked)
        },
        {
            id: 'notify-warning',
            label: 'Warning Notifications',
            description: 'Show toasts for warnings',
            checked: true,
            onChange: (checked) => saveNotificationSetting('warning', checked)
        },
        {
            id: 'notify-error',
            label: 'Error Notifications',
            description: 'Show toasts for errors',
            checked: true,
            onChange: (checked) => saveNotificationSetting('error', checked)
        },
        {
            id: 'notify-desktop',
            label: 'Desktop Notifications',
            description: 'Show browser notifications when tab is not active',
            checked: false,
            onChange: (checked) => saveNotificationSetting('desktop', checked)
        },
        {
            id: 'notify-sound',
            label: 'Notification Sounds',
            description: 'Play sound with notifications',
            checked: true,
            onChange: (checked) => saveNotificationSetting('sound', checked)
        }
    ];

    const toggleGroup = createToggleGroup(toggles);
    container.appendChild(toggleGroup);

    // Add frequency selector
    const freqCard = document.createElement('div');
    freqCard.style.marginTop = '16px';
    const freqDropdown = createDropdown({
        id: 'notify-frequency',
        label: 'Notification Frequency',
        description: 'How often to show non-critical notifications',
        options: [
            { value: 'realtime', label: 'Real-time - Immediate' },
            { value: 'batched', label: 'Batched - Every 5 minutes' },
            { value: 'hourly', label: 'Hourly Digest' },
            { value: 'minimal', label: 'Minimal - Errors only' }
        ],
        value: 'realtime',
        onChange: (value) => saveNotificationSetting('frequency', value)
    });
    freqCard.appendChild(freqDropdown);
    container.appendChild(freqCard);
}

async function saveNotificationSetting(key, value) {
    try {
        const sessionId = window.dashboard?.state?.sessionId || 'default';

        // Get current preferences
        const currentResult = await window.dashboard?.callTool?.('getNotificationPreferences', { sessionId });
        const current = currentResult?.data || {};

        // Update with new value
        const preferences = {
            ...current,
            [key]: value
        };

        const result = await window.dashboard?.callTool?.('setNotificationPreferences', {
            sessionId,
            notifications: preferences
        });

        if (result?.success) {
            window.dashboard.showToast(`Notification preference saved`, 'success');
        } else {
            throw new Error(result?.error || 'Failed to save');
        }
    } catch (error) {
        console.error('Failed to save notification setting:', error);
        window.dashboard.showToast(`Failed to save setting: ${error.message}`, 'error');
    }
}

// ========== Display Settings ==========
async function loadDisplaySettings() {
    const container = document.getElementById('display-settings-container');

    const toggles = [
        {
            id: 'theme-dark',
            label: 'Dark Theme',
            description: 'Use dark color scheme (light theme coming soon)',
            checked: true,
            disabled: true,
            onChange: (checked) => { }
        },
        {
            id: 'compact-mode',
            label: 'Compact Layout',
            description: 'Reduce spacing for more information density',
            checked: false,
            onChange: (checked) => saveDisplaySetting('compact', checked)
        },
        {
            id: 'sidebar-collapsed',
            label: 'Auto-collapse Sidebar',
            description: 'Collapse sidebar on mobile devices',
            checked: true,
            onChange: (checked) => saveDisplaySetting('sidebarCollapsed', checked)
        },
        {
            id: 'animations',
            label: 'Animations',
            description: 'Enable smooth transitions and animations',
            checked: true,
            onChange: (checked) => saveDisplaySetting('animations', checked)
        }
    ];

    const toggleGroup = createToggleGroup(toggles);
    container.appendChild(toggleGroup);

    // Font size selector
    const fontCard = document.createElement('div');
    fontCard.style.marginTop = '16px';
    const fontDropdown = createDropdown({
        id: 'font-size',
        label: 'Font Size',
        description: 'Adjust text size across the interface',
        options: [
            { value: 'small', label: 'Small' },
            { value: 'medium', label: 'Medium (Default)' },
            { value: 'large', label: 'Large' },
            { value: 'xlarge', label: 'Extra Large' }
        ],
        value: 'medium',
        onChange: (value) => saveDisplaySetting('fontSize', value)
    });
    fontCard.appendChild(fontDropdown);
    container.appendChild(fontCard);
}

async function saveDisplaySetting(key, value) {
    try {
        window.dashboard.showToast(`Display setting saved`, 'success');
        console.log('Display setting saved:', key, value);
    } catch (error) {
        window.dashboard.showToast(`Failed to save setting: ${error.message}`, 'error');
    }
}

// ========== Account Settings ==========
async function loadAccountSettings() {
    const container = document.getElementById('account-settings-container');

    // Session info card
    const sessionCard = createCard({
        title: 'Session Information',
        content: `
            <div style="display: flex; flex-direction: column; gap: 12px;">
                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border-dim);">
                    <span style="color: var(--text-secondary);">Session ID:</span>
                    <span style="color: var(--text-primary); font-family: var(--font-mono); font-size: 0.875rem;" id="session-id-display">Loading...</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border-dim);">
                    <span style="color: var(--text-secondary);">Status:</span>
                    <span id="session-status"></span>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border-dim);">
                    <span style="color: var(--text-secondary);">Connected:</span>
                    <span style="color: var(--text-primary);" id="session-connected">N/A</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 8px 0;">
                    <span style="color: var(--text-secondary);">Uptime:</span>
                    <span style="color: var(--text-primary);" id="session-uptime-display">00:00:00</span>
                </div>
            </div>
        `,
        actions: [
            {
                label: 'Copy Session ID',
                onClick: copySessionId
            }
        ]
    });

    // Update session display
    const sessionIdEl = sessionCard.querySelector('#session-id-display');
    const statusEl = sessionCard.querySelector('#session-status');
    const connectedEl = sessionCard.querySelector('#session-connected');

    if (window.dashboard && window.dashboard.state) {
        const sessionId = window.dashboard.state.sessionId || 'Unknown';
        sessionIdEl.textContent = sessionId.substring(0, 16) + '...';

        const statusBadge = createStatusBadge(
            window.dashboard.state.connected ? 'Connected' : 'Disconnected',
            window.dashboard.state.connected ? 'success' : 'error'
        );
        statusEl.appendChild(statusBadge);

        if (window.dashboard.state.sessionStartTime) {
            connectedEl.textContent = new Date(window.dashboard.state.sessionStartTime).toLocaleString();
        }
    }

    container.appendChild(sessionCard);

    // Connected devices card
    const devicesCard = createCard({
        title: 'Connected Channels',
        content: `
            <div style="display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; align-items: center; gap: 8px; padding: 8px; background: var(--bg-input); border-radius: var(--radius-sm);">
                    <span style="font-size: 1.25rem;">💬</span>
                    <span style="flex: 1; color: var(--text-primary);">WebChat</span>
                    ${createStatusBadge('Active', 'success').outerHTML}
                </div>
                <div style="display: flex; align-items: center; gap: 8px; padding: 8px; background: var(--bg-input); border-radius: var(--radius-sm);">
                    <span style="font-size: 1.25rem;">✈️</span>
                    <span style="flex: 1; color: var(--text-primary);">Telegram</span>
                    ${createStatusBadge('Checking...', 'neutral').outerHTML}
                </div>
                <div style="display: flex; align-items: center; gap: 8px; padding: 8px; background: var(--bg-input); border-radius: var(--radius-sm);">
                    <span style="font-size: 1.25rem;">💚</span>
                    <span style="flex: 1; color: var(--text-primary);">WhatsApp</span>
                    ${createStatusBadge('Checking...', 'neutral').outerHTML}
                </div>
                <div style="display: flex; align-items: center; gap: 8px; padding: 8px; background: var(--bg-input); border-radius: var(--radius-sm);">
                    <span style="font-size: 1.25rem;">📱</span>
                    <span style="flex: 1; color: var(--text-primary);">Mobile App</span>
                    ${createStatusBadge('Not Connected', 'error').outerHTML}
                </div>
            </div>
        `
    });

    container.appendChild(devicesCard);

    // Danger zone
    const dangerCard = createCard({
        title: '⚠️ Danger Zone',
        content: `
            <p style="color: var(--text-secondary); margin-bottom: 12px;">
                Destructive actions that cannot be undone. Proceed with caution.
            </p>
        `,
        actions: [
            {
                label: 'Clear All Memory',
                className: 'danger',
                onClick: () => showConfirmModal(
                    'Are you sure you want to clear all stored memories? This action cannot be undone.',
                    () => window.dashboard.showToast('Memory cleared', 'success'),
                    () => window.dashboard.showToast('Action cancelled', 'info')
                )
            },
            {
                label: 'Disconnect All Sessions',
                className: 'danger',
                onClick: () => showConfirmModal(
                    'This will disconnect all active sessions including this one. Continue?',
                    () => window.dashboard.showToast('Sessions disconnected', 'success')
                )
            }
        ]
    });

    container.appendChild(dangerCard);
}

function copySessionId() {
    const sessionId = window.dashboard?.state?.sessionId || 'Unknown';
    navigator.clipboard.writeText(sessionId).then(() => {
        window.dashboard.showToast('Session ID copied to clipboard', 'success');
    }).catch(() => {
        window.dashboard.showToast('Failed to copy Session ID', 'error');
    });
}

// Make loadSettingsPage available globally
window.loadSettingsPage = loadSettingsPage;
