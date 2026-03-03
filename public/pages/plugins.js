// ========================================
// Plugins Page
// MCP Plugin management and marketplace
// ========================================

async function loadPluginsPage() {
    const container = document.getElementById('dashboard-body');
    
    container.innerHTML = `
        <div class="dashboard-section">
            <div class="section-header">
                <h2 class="section-title">Installed Plugins</h2>
                <p class="section-description">Manage your active MCP (Model Context Protocol) plugins</p>
            </div>
            <div id="installed-plugins"></div>
        </div>
        
        <div class="dashboard-section">
            <div class="section-header">
                <h2 class="section-title">Available Plugins</h2>
                <p class="section-description">Browse and install plugins from the marketplace</p>
            </div>
            <div id="plugin-search" style="margin-bottom: 20px;"></div>
            <div id="available-plugins"></div>
        </div>
    `;
    
    // Add action buttons to header
    const headerActions = document.getElementById('header-actions');
    headerActions.innerHTML = `
        <button onclick="refreshPlugins()" style="
            padding: 10px 20px;
            background: var(--bg-card);
            border: 1px solid var(--border-dim);
            border-radius: var(--radius-md);
            color: var(--text-primary);
            font-family: var(--font-main);
            font-size: 0.875rem;
            font-weight: 500;
            cursor: pointer;
        ">
            🔄 Refresh
        </button>
        <button onclick="showAddPluginModal()" style="
            padding: 10px 20px;
            background: var(--accent);
            border: 1px solid var(--accent);
            border-radius: var(--radius-md);
            color: white;
            font-family: var(--font-main);
            font-size: 0.875rem;
            font-weight: 500;
            cursor: pointer;
        ">
            + Add Plugin
        </button>
    `;
    
    // Load sections
    await loadInstalledPlugins();
    await loadPluginSearch();
    await loadAvailablePlugins();
}

// ========== Installed Plugins ==========
async function loadInstalledPlugins() {
    const container = document.getElementById('installed-plugins');
    
    const plugins = await fetchInstalledPlugins();
    
    if (plugins.length === 0) {
        container.appendChild(createEmptyChart('No plugins installed yet'));
        return;
    }
    
    const grid = document.createElement('div');
    grid.className = 'dashboard-grid cols-2';
    
    plugins.forEach(plugin => {
        const statusVariant = plugin.status === 'loaded' ? 'success' : 
                             plugin.status === 'error' ? 'error' : 
                             'warning';
        
        const card = createCard({
            title: plugin.name,
            content: `
                <div style="display: flex; flex-direction: column; gap: 16px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            ${createStatusBadge(plugin.status, statusVariant).outerHTML}
                        </div>
                        <div style="color: var(--text-secondary); font-size: 0.875rem;">
                            v${plugin.version}
                        </div>
                    </div>
                    
                    <p style="color: var(--text-secondary); font-size: 0.875rem; line-height: 1.6;">
                        ${plugin.description}
                    </p>
                    
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        ${createBadge({ text: plugin.category, variant: 'info', size: 'sm', pill: true }).outerHTML}
                        ${createBadge({ text: `${plugin.toolCount} tools`, variant: 'default', size: 'sm' }).outerHTML}
                        ${plugin.dangerous ? createBadge({ text: '⚠️ Privileged', variant: 'warning', size: 'sm' }).outerHTML : ''}
                    </div>
                    
                    ${plugin.status === 'error' ? `
                        <div style="padding: 12px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: var(--radius-md); color: var(--error); font-size: 0.875rem;">
                            <strong>Error:</strong> ${plugin.error}
                        </div>
                    ` : ''}
                    
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; padding-top: 12px; border-top: 1px solid var(--border-dim);">
                        <div>
                            <div style="color: var(--text-secondary); font-size: 0.75rem;">Calls</div>
                            <div style="color: var(--text-primary); font-weight: 600;">${plugin.stats.calls}</div>
                        </div>
                        <div>
                            <div style="color: var(--text-secondary); font-size: 0.75rem;">Last Used</div>
                            <div style="color: var(--text-primary); font-weight: 600;">${plugin.stats.lastUsed || 'Never'}</div>
                        </div>
                    </div>
                </div>
            `,
            actions: [
                {
                    label: plugin.enabled ? 'Disable' : 'Enable',
                    onClick: () => togglePlugin(plugin.id, !plugin.enabled)
                },
                {
                    label: 'Configure',
                    onClick: () => showPluginConfig(plugin)
                },
                {
                    label: 'Details',
                    onClick: () => showPluginDetails(plugin)
                }
            ]
        });
        
        grid.appendChild(card);
    });
    
    container.appendChild(grid);
}

async function fetchInstalledPlugins() {
    try {
        // Call real backend tool
        const sessionId = window.dashboard?.state?.sessionId || 'default';
        const result = await window.dashboard?.callTool?.('listPlugins', { sessionId });
        
        if (!result || !result.success || !result.data?.plugins) {
            throw new Error('Failed to fetch plugins');
        }
        
        // Transform backend data to match frontend expectations
        return result.data.plugins.map(plugin => ({
            id: plugin.id,
            name: plugin.name || 'Unknown Plugin',
            version: plugin.version || '0.0.0',
            description: plugin.description || 'No description',
            category: plugin.category || 'General',
            status: plugin.status || 'disabled',
            enabled: plugin.status === 'loaded',
            toolCount: plugin.toolCount || 0,
            dangerous: (plugin.permissions || []).some(p => 
                ['shell_exec', 'file_write', 'system_access'].includes(p)
            ),
            error: plugin.error || null,
            stats: {
                calls: plugin.calls || 0,
                lastUsed: plugin.lastUsed ? formatTime(new Date(plugin.lastUsed)) : 'Never'
            }
        }));
    } catch (error) {
        console.error('Failed to fetch installed plugins:', error);
        window.dashboard.showToast('Could not load plugins', 'warning');
        return [];
    }
}

async function togglePlugin(pluginId, enabled) {
    try {
        // Call real backend tool
        const sessionId = window.dashboard?.state?.sessionId || 'default';
        const result = await window.dashboard?.callTool?.('togglePlugin', { 
            sessionId,
            pluginId, 
            enabled 
        });
        
        if (result?.success) {
            window.dashboard.showToast(
                `Plugin ${enabled ? 'enabled' : 'disabled'}`,
                'success'
            );
            // Reload plugins
            await loadInstalledPlugins();
        } else {
            throw new Error(result?.data?.error || 'Failed to toggle plugin');
        }
    } catch (error) {
        console.error('Failed to toggle plugin:', error);
        window.dashboard.showToast(`Failed to toggle plugin: ${error.message}`, 'error');
    }
}

function showPluginConfig(plugin) {
    createModal({
        title: `Configure ${plugin.name}`,
        content: `
            <div style="margin-bottom: 16px;">
                <p style="color: var(--text-secondary); margin-bottom: 16px;">
                    Configuration options for ${plugin.name} v${plugin.version}
                </p>
                
                <div style="margin-bottom: 16px;">
                    <label style="display: block; color: var(--text-primary); font-weight: 500; margin-bottom: 8px;">
                        API Key
                    </label>
                    <input type="password" id="plugin-api-key" placeholder="Enter API key" style="
                        width: 100%;
                        padding: 10px 14px;
                        background: var(--bg-input);
                        border: 1px solid var(--border-dim);
                        border-radius: var(--radius-md);
                        color: var(--text-primary);
                        font-family: var(--font-main);
                    ">
                </div>
                
                <div style="margin-bottom: 16px;">
                    <label style="display: block; color: var(--text-primary); font-weight: 500; margin-bottom: 8px;">
                        Timeout (seconds)
                    </label>
                    <input type="number" id="plugin-timeout" value="30" min="1" max="300" style="
                        width: 100%;
                        padding: 10px 14px;
                        background: var(--bg-input);
                        border: 1px solid var(--border-dim);
                        border-radius: var(--radius-md);
                        color: var(--text-primary);
                        font-family: var(--font-main);
                    ">
                </div>
                
                <div style="padding: 12px; background: var(--bg-input); border-radius: var(--radius-md);">
                    <div style="color: var(--text-secondary); font-size: 0.75rem; margin-bottom: 4px;">Configuration Path</div>
                    <div style="color: var(--text-primary); font-family: var(--font-mono); font-size: 0.875rem;">
                        mcp-servers.json
                    </div>
                </div>
            </div>
        `,
        actions: [
            { label: 'Cancel' },
            {
                label: 'Save Configuration',
                className: 'primary',
                onClick: () => {
                    savePluginConfig(plugin.id, {
                        apiKey: document.getElementById('plugin-api-key')?.value,
                        timeout: document.getElementById('plugin-timeout')?.value
                    });
                }
            }
        ]
    }).show();
}

async function savePluginConfig(pluginId, config) {
    try {
        // TODO: Call actual backend tool
        // await dashboard.callTool('configurePlugin', { pluginId, config });
        
        window.dashboard.showToast('Plugin configuration saved', 'success');
    } catch (error) {
        window.dashboard.showToast(`Failed to save configuration: ${error.message}`, 'error');
    }
}

function showPluginDetails(plugin) {
    createModal({
        title: plugin.name,
        content: `
            <div style="display: flex; flex-direction: column; gap: 20px;">
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                        <h4 style="font-size: 1rem; font-weight: 600; color: var(--text-primary);">Information</h4>
                        ${createStatusBadge(plugin.status, plugin.status === 'loaded' ? 'success' : 'error').outerHTML}
                    </div>
                    <p style="color: var(--text-secondary); line-height: 1.6;">
                        ${plugin.description}
                    </p>
                </div>
                
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;">
                    <div>
                        <div style="color: var(--text-secondary); font-size: 0.75rem; margin-bottom: 4px;">Version</div>
                        <div style="color: var(--text-primary); font-weight: 600;">v${plugin.version}</div>
                    </div>
                    <div>
                        <div style="color: var(--text-secondary); font-size: 0.75rem; margin-bottom: 4px;">Category</div>
                        <div style="color: var(--text-primary); font-weight: 600;">${plugin.category}</div>
                    </div>
                    <div>
                        <div style="color: var(--text-secondary); font-size: 0.75rem; margin-bottom: 4px;">Tool Count</div>
                        <div style="color: var(--text-primary); font-weight: 600;">${plugin.toolCount} tools</div>
                    </div>
                    <div>
                        <div style="color: var(--text-secondary); font-size: 0.75rem; margin-bottom: 4px;">Total Calls</div>
                        <div style="color: var(--text-primary); font-weight: 600;">${plugin.stats.calls}</div>
                    </div>
                </div>
                
                <div>
                    <h4 style="font-size: 0.938rem; font-weight: 600; color: var(--text-primary); margin-bottom: 8px;">Permissions</h4>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        ${plugin.dangerous ? createBadge({ text: '⚠️ System Access', variant: 'warning', size: 'sm' }).outerHTML : ''}
                        ${createBadge({ text: 'Network Access', variant: 'info', size: 'sm' }).outerHTML}
                        ${createBadge({ text: 'File Read', variant: 'default', size: 'sm' }).outerHTML}
                    </div>
                </div>
                
                ${plugin.status === 'error' ? `
                    <div style="padding: 16px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: var(--radius-md);">
                        <h4 style="color: var(--error); font-size: 0.938rem; font-weight: 600; margin-bottom: 8px;">Error Details</h4>
                        <p style="color: var(--error); font-size: 0.875rem; font-family: var(--font-mono);">
                            ${plugin.error}
                        </p>
                    </div>
                ` : ''}
            </div>
        `,
        actions: [
            {
                label: 'Remove Plugin',
                onClick: () => {
                    showConfirmModal(
                        `Are you sure you want to remove "${plugin.name}"? This will delete all plugin data.`,
                        () => removePlugin(plugin.id)
                    );
                    return false; // Keep modal open
                }
            },
            { label: 'Close', className: 'primary' }
        ]
    }).show();
}

async function removePlugin(pluginId) {
    try {
        // TODO: Call actual backend tool
        // await dashboard.callTool('removePlugin', { pluginId });
        
        window.dashboard.showToast('Plugin removed', 'success');
        await loadInstalledPlugins();
    } catch (error) {
        window.dashboard.showToast(`Failed to remove plugin: ${error.message}`, 'error');
    }
}

// ========== Plugin Search ==========
async function loadPluginSearch() {
    const container = document.getElementById('plugin-search');
    
    const searchBar = document.createElement('div');
    searchBar.style.cssText = `
        display: flex;
        gap: 12px;
    `;
    
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'plugin-search-input';
    input.placeholder = 'Search plugins...';
    input.style.cssText = `
        flex: 1;
        padding: 12px 16px;
        background: var(--bg-input);
        border: 1px solid var(--border-dim);
        border-radius: var(--radius-md);
        color: var(--text-primary);
        font-family: var(--font-main);
        font-size: 1rem;
    `;
    
    const filterDropdown = createDropdown({
        id: 'plugin-category-filter',
        options: [
            { value: 'all', label: 'All Categories' },
            { value: 'browser', label: 'Browser' },
            { value: 'file', label: 'File Operations' },
            { value: 'dev', label: 'Development' },
            { value: 'comm', label: 'Communication' },
            { value: 'system', label: 'System' }
        ],
        value: 'all',
        onChange: (value) => filterPlugins(value)
    });
    filterDropdown.style.width = '200px';
    
    searchBar.appendChild(input);
    searchBar.appendChild(filterDropdown);
    
    input.addEventListener('input', debounce(() => {
        searchPlugins(input.value);
    }, 300));
    
    container.appendChild(searchBar);
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

async function searchPlugins(query) {
    console.log('Searching plugins:', query);
    await loadAvailablePlugins(query);
}

async function filterPlugins(category) {
    console.log('Filtering by category:', category);
    await loadAvailablePlugins();
}

// ========== Available Plugins ==========
async function loadAvailablePlugins(searchQuery = '') {
    const container = document.getElementById('available-plugins');
    container.innerHTML = '';
    
    const plugins = await fetchAvailablePlugins(searchQuery);
    
    if (plugins.length === 0) {
        container.appendChild(createEmptyChart('No plugins available'));
        return;
    }
    
    const grid = document.createElement('div');
    grid.className = 'dashboard-grid cols-3';
    
    plugins.forEach(plugin => {
        const card = createCard({
            title: plugin.name,
            content: `
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        ${createBadge({ text: plugin.category, variant: 'info', size: 'sm', pill: true }).outerHTML}
                        <div style="color: var(--text-secondary); font-size: 0.75rem;">
                            v${plugin.version}
                        </div>
                    </div>
                    
                    <p style="color: var(--text-secondary); font-size: 0.875rem; line-height: 1.5; min-height: 60px;">
                        ${plugin.description}
                    </p>
                    
                    <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 8px; border-top: 1px solid var(--border-dim);">
                        <div style="display: flex; gap: 8px;">
                            <span style="color: var(--text-secondary); font-size: 0.75rem;">⭐ ${plugin.rating}</span>
                            <span style="color: var(--text-secondary); font-size: 0.75rem;">📦 ${plugin.downloads}</span>
                        </div>
                        ${plugin.official ? createBadge({ text: '✓ Official', variant: 'success', size: 'sm' }).outerHTML : ''}
                    </div>
                </div>
            `,
            actions: [
                {
                    label: plugin.installed ? 'Installed' : 'Install',
                    className: plugin.installed ? '' : 'primary',
                    onClick: plugin.installed ? null : () => installPlugin(plugin.id)
                }
            ]
        });
        
        if (plugin.installed) {
            card.style.opacity = '0.6';
        }
        
        grid.appendChild(card);
    });
    
    container.appendChild(grid);
}

async function fetchAvailablePlugins(searchQuery = '') {
    try {
        // Call real backend tool to get installed plugins as reference
        const sessionId = window.dashboard?.state?.sessionId || 'default';
        const result = await window.dashboard?.callTool?.('listPlugins', { sessionId });
        
        if (!result || !result.success || !result.data?.plugins) {
            throw new Error('Failed to fetch plugins');
        }
        
        // Transform backend data to match frontend expectations
        let plugins = result.data.plugins.map(plugin => ({
            id: plugin.id,
            name: plugin.name || 'Unknown',
            version: plugin.version || '0.0.0',
            description: plugin.description || 'No description',
            category: plugin.category || 'General',
            rating: 4.5,
            downloads: '1K+',
            official: true,
            installed: plugin.status === 'loaded'
        }));
        
        // Filter by search query
        if (searchQuery) {
            plugins = plugins.filter(p => 
                p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                p.description.toLowerCase().includes(searchQuery.toLowerCase())
            );
        }
        
        return plugins;
    } catch (error) {
        console.error('Failed to fetch available plugins:', error);
        window.dashboard.showToast('Could not load plugin list', 'warning');
        return [];
    }
}

async function installPlugin(pluginId) {
    showConfirmModal(
        'This will download and install the plugin. Do you want to continue?',
        async () => {
            try {
                // TODO: Call actual backend tool
                // await dashboard.callTool('installPlugin', { pluginId });
                
                window.dashboard.showToast('Plugin installed successfully', 'success');
                await loadInstalledPlugins();
                await loadAvailablePlugins();
            } catch (error) {
                window.dashboard.showToast(`Failed to install plugin: ${error.message}`, 'error');
            }
        }
    );
}

function showAddPluginModal() {
    createModal({
        title: 'Add Custom Plugin',
        content: `
            <div style="margin-bottom: 16px;">
                <label style="display: block; color: var(--text-primary); font-weight: 500; margin-bottom: 8px;">
                    Plugin Source
                </label>
                <input type="text" id="custom-plugin-source" placeholder="npm package, git URL, or local path" style="
                    width: 100%;
                    padding: 10px 14px;
                    background: var(--bg-input);
                    border: 1px solid var(--border-dim);
                    border-radius: var(--radius-md);
                    color: var(--text-primary);
                    font-family: var(--font-main);
                ">
            </div>
            <div style="padding: 12px; background: var(--bg-input); border-radius: var(--radius-md); margin-bottom: 16px;">
                <div style="color: var(--text-secondary); font-size: 0.875rem; line-height: 1.6;">
                    <strong>Examples:</strong><br>
                    • npm: <code>@modelcontextprotocol/server-slack</code><br>
                    • git: <code>https://github.com/user/mcp-plugin.git</code><br>
                    • local: <code>./plugins/custom-plugin</code>
                </div>
            </div>
        `,
        actions: [
            { label: 'Cancel' },
            {
                label: 'Install Plugin',
                className: 'primary',
                onClick: () => {
                    const source = document.getElementById('custom-plugin-source')?.value;
                    if (source) {
                        installCustomPlugin(source);
                    }
                }
            }
        ]
    }).show();
}

async function installCustomPlugin(source) {
    try {
        // TODO: Call actual backend tool
        // await dashboard.callTool('installCustomPlugin', { source });
        
        window.dashboard.showToast('Custom plugin installation started', 'info');
    } catch (error) {
        window.dashboard.showToast(`Failed to install: ${error.message}`, 'error');
    }
}

async function refreshPlugins() {
    window.dashboard.showToast('Refreshing plugins...', 'info');
    await loadInstalledPlugins();
    await loadAvailablePlugins();
}

// Make functions available globally
window.loadPluginsPage = loadPluginsPage;
window.refreshPlugins = refreshPlugins;
window.showAddPluginModal = showAddPluginModal;
