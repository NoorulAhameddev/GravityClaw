// ========================================
// Admin Panel Page
// Group management and permissions control
// ========================================

async function loadAdminPage() {
    const container = document.getElementById('dashboard-body');
    
    container.innerHTML = `
        <div class="dashboard-section">
            <div class="section-header">
                <h2 class="section-title">Group Overview</h2>
                <p class="section-description">Manage groups where you have admin privileges</p>
            </div>
            <div id="groups-overview"></div>
        </div>
        
        <div class="dashboard-section">
            <div class="section-header">
                <h2 class="section-title">Group Settings</h2>
                <p class="section-description">Configure permissions and tools for selected group</p>
            </div>
            <div id="group-settings"></div>
        </div>
        
        <div class="dashboard-section">
            <div class="section-header">
                <h2 class="section-title">User Permissions Matrix</h2>
                <p class="section-description">View and manage user-level tool access</p>
            </div>
            <div id="permissions-matrix"></div>
        </div>
    `;
    
    // Load sections
    await loadGroupsOverview();
    await loadGroupSettings();
    await loadPermissionsMatrix();
}

// ========== Groups Overview ==========
async function loadGroupsOverview() {
    const container = document.getElementById('groups-overview');
    
    const groups = await fetchUserGroups();
    
    if (groups.length === 0) {
        container.appendChild(createEmptyChart('You are not an admin in any groups'));
        return;
    }
    
    const grid = document.createElement('div');
    grid.className = 'dashboard-grid cols-2';
    
    groups.forEach(group => {
        const platformIcon = getPlatformIcon(group.platform);
        const roleVariant = group.role === 'owner' ? 'primary' : 'error';
        
        const card = createCard({
            title: group.name,
            content: `
                <div style="display: flex; flex-direction: column; gap: 16px;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <span style="font-size: 2rem;">${platformIcon}</span>
                        <div style="flex: 1;">
                            <div style="color: var(--text-secondary); font-size: 0.75rem; margin-bottom: 4px;">Platform</div>
                            <div style="color: var(--text-primary); font-weight: 500;">${group.platform}</div>
                        </div>
                        <div>${createRoleBadge(group.role).outerHTML}</div>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; padding: 12px; background: var(--bg-input); border-radius: var(--radius-md);">
                        <div>
                            <div style="color: var(--text-secondary); font-size: 0.75rem; margin-bottom: 4px;">Members</div>
                            <div style="color: var(--text-primary); font-size: 1.25rem; font-weight: 600;">${group.memberCount}</div>
                        </div>
                        <div>
                            <div style="color: var(--text-secondary); font-size: 0.75rem; margin-bottom: 4px;">Admins</div>
                            <div style="color: var(--text-primary); font-size: 1.25rem; font-weight: 600;">${group.adminCount}</div>
                        </div>
                        <div>
                            <div style="color: var(--text-secondary); font-size: 0.75rem; margin-bottom: 4px;">Tools</div>
                            <div style="color: var(--text-primary); font-size: 1.25rem; font-weight: 600;">${group.enabledTools}</div>
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        ${createBadge({ text: `ID: ${group.id.substring(0, 8)}...`, variant: 'default', size: 'sm' }).outerHTML}
                        ${group.dangerousToolsEnabled ? createBadge({ text: '⚠️ Dangerous Tools', variant: 'warning', size: 'sm' }).outerHTML : ''}
                        ${createStatusBadge(group.active ? 'Active' : 'Inactive', group.active ? 'success' : 'error').outerHTML}
                    </div>
                </div>
            `,
            actions: [
                {
                    label: 'Configure',
                    onClick: () => selectGroup(group.id)
                },
                {
                    label: 'View Details',
                    onClick: () => showGroupDetails(group)
                }
            ]
        });
        
        grid.appendChild(card);
    });
    
    container.appendChild(grid);
}

async function fetchUserGroups() {
    try {
        // Call real backend tool
        const sessionId = window.dashboard?.state?.sessionId || 'default';
        const result = await window.dashboard?.callTool?.('listGroupsForUser', { sessionId });
        
        if (!result || !result.success || !result.data?.groups) {
            throw new Error('Failed to fetch groups');
        }
        
        // Transform backend data to match frontend expectations
        return result.data.groups.map(group => ({
            id: group.groupId || group.id,
            name: group.name || group.groupId || 'Unnamed Group',
            platform: group.platform || 'Unknown',
            role: group.role || 'member',
            memberCount: group.memberCount || 0,
            adminCount: group.adminCount || 0,
            enabledTools: group.enabledTools?.length || 0,
            dangerousToolsEnabled: (group.enabledTools || []).some(tool => 
                ['run_shell', 'file_ops', 'code_exec'].includes(tool)
            ),
            active: group.active !== false
        }));
    } catch (error) {
        console.error('Failed to fetch user groups:', error);
        window.dashboard.showToast('Could not load groups', 'warning');
        return [];
    }
}

function getPlatformIcon(platform) {
    const icons = {
        'Telegram': '✈️',
        'WhatsApp': '💚',
        'Discord': '💙',
        'Slack': '💼'
    };
    return icons[platform] || '💬';
}

let selectedGroupId = null;

function selectGroup(groupId) {
    selectedGroupId = groupId;
    loadGroupSettings();
    window.dashboard.showToast(`Selected group: ${groupId}`, 'info');
}

// ========== Group Settings ==========
async function loadGroupSettings() {
    const container = document.getElementById('group-settings');
    container.innerHTML = '';
    
    if (!selectedGroupId) {
        container.appendChild(createEmptyChart('Select a group from above to manage settings'));
        return;
    }
    
    const groupSettings = await fetchGroupSettings(selectedGroupId);
    
    const settingsCard = document.createElement('div');
    settingsCard.className = 'dashboard-card';
    settingsCard.style.padding = '24px';
    
    // Group header
    const header = document.createElement('div');
    header.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 24px;
        padding-bottom: 16px;
        border-bottom: 1px solid var(--border-dim);
    `;
    header.innerHTML = `
        <div>
            <h3 style="font-size: 1.25rem; font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">
                ${groupSettings.name}
            </h3>
            <p style="color: var(--text-secondary); font-size: 0.875rem;">
                ${groupSettings.platform} · ${groupSettings.memberCount} members
            </p>
        </div>
        <div>
            ${createRoleBadge(groupSettings.role).outerHTML}
        </div>
    `;
    settingsCard.appendChild(header);
    
    // Tool permissions
    const toolsSection = document.createElement('div');
    toolsSection.style.marginBottom = '24px';
    
    const toolsTitle = document.createElement('h4');
    toolsTitle.style.cssText = `
        font-size: 1rem;
        font-weight: 600;
        color: var(--text-primary);
        margin-bottom: 16px;
    `;
    toolsTitle.textContent = 'Tool Permissions';
    toolsSection.appendChild(toolsTitle);
    
    const toolCategories = [
        {
            name: 'Safe Tools',
            description: 'Standard AI capabilities',
            tools: groupSettings.tools.safe
        },
        {
            name: 'Dangerous Tools',
            description: '⚠️ Can modify system or execute commands',
            tools: groupSettings.tools.dangerous
        }
    ];
    
    toolCategories.forEach(category => {
        const categoryContainer = document.createElement('div');
        categoryContainer.style.marginBottom = '20px';
        
        const categoryTitle = document.createElement('div');
        categoryTitle.style.cssText = `
            font-weight: 500;
            color: var(--text-primary);
            margin-bottom: 12px;
            font-size: 0.875rem;
        `;
        categoryTitle.textContent = category.name;
        
        const categoryDesc = document.createElement('div');
        categoryDesc.style.cssText = `
            color: var(--text-secondary);
            font-size: 0.75rem;
            margin-bottom: 12px;
        `;
        categoryDesc.textContent = category.description;
        
        categoryContainer.appendChild(categoryTitle);
        categoryContainer.appendChild(categoryDesc);
        
        const toolToggles = category.tools.map(tool => createToggle({
            id: `tool-${tool.name}`,
            label: tool.name,
            description: tool.description,
            checked: tool.enabled,
            onChange: (checked) => toggleGroupTool(selectedGroupId, tool.name, checked)
        }));
        
        toolToggles.forEach((toggle, index) => {
            categoryContainer.appendChild(toggle);
            if (index < toolToggles.length - 1) {
                const separator = document.createElement('div');
                separator.style.cssText = `
                    height: 1px;
                    background: var(--border-dim);
                    margin: 12px 0;
                `;
                categoryContainer.appendChild(separator);
            }
        });
        
        toolsSection.appendChild(categoryContainer);
    });
    
    settingsCard.appendChild(toolsSection);
    
    // Admin management
    const adminsSection = document.createElement('div');
    adminsSection.style.marginTop = '24px';
    
    const adminsTitle = document.createElement('h4');
    adminsTitle.style.cssText = `
        font-size: 1rem;
        font-weight: 600;
        color: var(--text-primary);
        margin-bottom: 16px;
    `;
    adminsTitle.textContent = 'Admin Users';
    adminsSection.appendChild(adminsTitle);
    
    groupSettings.admins.forEach((admin, index) => {
        const adminRow = document.createElement('div');
        adminRow.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px;
            background: var(--bg-input);
            border-radius: var(--radius-md);
            margin-bottom: 8px;
        `;
        
        adminRow.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                <div style="width: 40px; height: 40px; background: var(--accent); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: 600;">
                    ${admin.name.substring(0, 2).toUpperCase()}
                </div>
                <div>
                    <div style="color: var(--text-primary); font-weight: 500;">${admin.name}</div>
                    <div style="color: var(--text-secondary); font-size: 0.75rem;">${admin.id}</div>
                </div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                ${createRoleBadge(admin.role).outerHTML}
                ${admin.role !== 'owner' ? `
                    <button onclick="removeAdmin('${selectedGroupId}', '${admin.id}')" style="
                        padding: 6px 12px;
                        background: var(--error);
                        border: none;
                        border-radius: var(--radius-sm);
                        color: white;
                        font-size: 0.75rem;
                        cursor: pointer;
                    ">Remove</button>
                ` : ''}
            </div>
        `;
        
        adminsSection.appendChild(adminRow);
    });
    
    // Add admin button
    const addAdminBtn = document.createElement('button');
    addAdminBtn.textContent = '+ Add Admin';
    addAdminBtn.style.cssText = `
        width: 100%;
        padding: 12px;
        background: var(--bg-input);
        border: 1px dashed var(--border-dim);
        border-radius: var(--radius-md);
        color: var(--text-primary);
        font-family: var(--font-main);
        font-size: 0.875rem;
        cursor: pointer;
        transition: all var(--transition-fast);
        margin-top: 8px;
    `;
    addAdminBtn.addEventListener('click', () => showAddAdminModal(selectedGroupId));
    adminsSection.appendChild(addAdminBtn);
    
    settingsCard.appendChild(adminsSection);
    container.appendChild(settingsCard);
}

async function fetchGroupSettings(groupId) {
    try {
        // Call real backend tool
        const sessionId = window.dashboard?.state?.sessionId || 'default';
        const result = await window.dashboard?.callTool?.('getGroupSettings', { sessionId, groupId });
        
        if (!result || !result.success || !result.data) {
            throw new Error('Failed to fetch group settings');
        }
        
        const settings = result.data;
        
        // Get list of dangerous tools
        const dangerousResult = await window.dashboard?.callTool?.('getDangerousTools', { sessionId });
        const dangerousToolNames = dangerousResult?.data?.tools || [];
        
        return {
            id: settings.groupId || groupId,
            name: settings.name || groupId,
            platform: settings.platform || 'Unknown',
            role: settings.role || 'member',
            memberCount: settings.memberCount || 0,
            tools: {
                safe: (settings.enabledTools || [])
                    .filter(tool => !dangerousToolNames.includes(tool))
                    .map(tool => ({ name: tool, description: `Enable ${tool}`, enabled: true })),
                dangerous: dangerousToolNames
                    .filter(tool => settings.enabledTools?.includes(tool))
                    .map(tool => ({ name: tool, description: `Enable ${tool}`, enabled: true }))
            },
            admins: settings.admins || []
        };
    } catch (error) {
        console.error('Failed to fetch group settings:', error);
        window.dashboard.showToast('Could not load group settings', 'warning');
        return null;
    }
}

async function toggleGroupTool(groupId, toolName, enabled) {
    try {
        // Call real backend tool
        const sessionId = window.dashboard?.state?.sessionId || 'default';
        const result = await window.dashboard?.callTool?.('updateGroupToolPermissions', { 
            sessionId,
            groupId, 
            toolName, 
            enabled 
        });
        
        if (result?.success) {
            window.dashboard.showToast(
                `Tool "${toolName}" ${enabled ? 'enabled' : 'disabled'} for group`,
                'success'
            );
            // Reload group settings
            await loadGroupSettings();
        } else {
            throw new Error(result?.data?.error || 'Failed to update');
        }
    } catch (error) {
        console.error('Failed to toggle group tool:', error);
        window.dashboard.showToast(`Failed to update tool: ${error.message}`, 'error');
    }
}

function showAddAdminModal(groupId) {
    createModal({
        title: 'Add Admin',
        content: `
            <div style="margin-bottom: 16px;">
                <label style="display: block; color: var(--text-primary); font-weight: 500; margin-bottom: 8px;">
                    User ID or Username
                </label>
                <input type="text" id="new-admin-id" placeholder="@username or user_id" style="
                    width: 100%;
                    padding: 10px 14px;
                    background: var(--bg-input);
                    border: 1px solid var(--border-dim);
                    border-radius: var(--radius-md);
                    color: var(--text-primary);
                    font-family: var(--font-main);
                    font-size: 0.938rem;
                ">
            </div>
            <p style="color: var(--text-secondary); font-size: 0.875rem;">
                The user must be a member of the group to be made an admin.
            </p>
        `,
        actions: [
            { label: 'Cancel' },
            {
                label: 'Add Admin',
                className: 'primary',
                onClick: () => {
                    const userId = document.getElementById('new-admin-id').value;
                    if (userId) {
                        addGroupAdmin(groupId, userId);
                    }
                }
            }
        ]
    }).show();
}

async function addGroupAdmin(groupId, userId) {
    try {
        // TODO: Call actual backend tool
        // await dashboard.callTool('addGroupAdmin', { groupId, userId });
        
        window.dashboard.showToast(`Admin added successfully`, 'success');
        loadGroupSettings(); // Refresh
    } catch (error) {
        window.dashboard.showToast(`Failed to add admin: ${error.message}`, 'error');
    }
}

async function removeAdmin(groupId, userId) {
    showConfirmModal(
        'Are you sure you want to remove this admin? They will lose all administrative privileges.',
        async () => {
            try {
                // TODO: Call actual backend tool
                // await dashboard.callTool('removeGroupAdmin', { groupId, userId });
                
                window.dashboard.showToast('Admin removed', 'success');
                loadGroupSettings(); // Refresh
            } catch (error) {
                window.dashboard.showToast(`Failed to remove admin: ${error.message}`, 'error');
            }
        }
    );
}

// Make removeAdmin available globally for inline onclick
window.removeAdmin = removeAdmin;

// ========== Permissions Matrix ==========
async function loadPermissionsMatrix() {
    const container = document.getElementById('permissions-matrix');
    
    const permissions = await fetchPermissionsMatrix();
    
    const card = document.createElement('div');
    card.style.cssText = `
        background: var(--bg-card);
        border: 1px solid var(--border-dim);
        border-radius: var(--radius-lg);
        overflow: hidden;
    `;
    
    // Matrix header
    const header = document.createElement('div');
    header.style.cssText = `
        display: grid;
        grid-template-columns: 200px 1fr 120px 120px 100px;
        padding: 16px;
        background: var(--bg-input);
        border-bottom: 1px solid var(--border-dim);
        font-weight: 600;
        color: var(--text-primary);
        font-size: 0.875rem;
    `;
    header.innerHTML = `
        <div>User</div>
        <div>Tools Allowed</div>
        <div>Last Used</div>
        <div>Usage Count</div>
        <div>Actions</div>
    `;
    card.appendChild(header);
    
    // Matrix rows
    permissions.forEach((perm, index) => {
        const row = document.createElement('div');
        row.style.cssText = `
            display: grid;
            grid-template-columns: 200px 1fr 120px 120px 100px;
            padding: 16px;
            ${index < permissions.length - 1 ? 'border-bottom: 1px solid var(--border-dim);' : ''}
            font-size: 0.875rem;
            align-items: center;
            transition: background var(--transition-fast);
        `;
        row.addEventListener('mouseenter', () => {
            row.style.background = 'var(--bg-hover)';
        });
        row.addEventListener('mouseleave', () => {
            row.style.background = 'transparent';
        });
        
        const toolBadges = perm.tools.slice(0, 3).map(tool => 
            createBadge({ text: tool, variant: 'info', size: 'sm', pill: true }).outerHTML
        ).join('');
        
        const moreTools = perm.tools.length > 3 ? 
            `<span style="color: var(--text-secondary); font-size: 0.75rem; margin-left: 4px;">+${perm.tools.length - 3} more</span>` : 
            '';
        
        row.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <div style="width: 32px; height: 32px; background: var(--accent); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: 0.75rem;">
                    ${perm.username.substring(0, 2).toUpperCase()}
                </div>
                <div>
                    <div style="color: var(--text-primary); font-weight: 500;">${perm.username}</div>
                    <div style="color: var(--text-secondary); font-size: 0.75rem;">${perm.userId}</div>
                </div>
            </div>
            <div style="display: flex; gap: 4px; flex-wrap: wrap; align-items: center;">
                ${toolBadges}
                ${moreTools}
            </div>
            <div style="color: var(--text-secondary);">${formatTime(perm.lastUsed)}</div>
            <div style="color: var(--text-primary); font-weight: 600;">${perm.usageCount}</div>
            <div>
                <button onclick="showUserPermissions('${perm.userId}')" style="
                    padding: 6px 12px;
                    background: var(--bg-input);
                    border: 1px solid var(--border-dim);
                    border-radius: var(--radius-sm);
                    color: var(--text-primary);
                    font-size: 0.75rem;
                    cursor: pointer;
                ">Edit</button>
            </div>
        `;
        
        card.appendChild(row);
    });
    
    container.appendChild(card);
}

async function fetchPermissionsMatrix() {
    try {
        // Get group settings as proxy for permissions
        if (!selectedGroupId) {
            return [];
        }
        
        const sessionId = window.dashboard?.state?.sessionId || 'default';
        const result = await window.dashboard?.callTool?.('getGroupSettings', { sessionId, groupId: selectedGroupId });
        
        if (!result || !result.success || !result.data) {
            throw new Error('Failed to fetch permissions');
        }
        
        const settings = result.data;
        
        // Return admins with their permissions
        return (settings.admins || []).map(admin => ({
            userId: admin.id || admin.userId,
            username: admin.name || admin.username || 'Unknown',
            tools: settings.enabledTools || [],
            lastUsed: new Date(admin.lastUsed || Date.now()),
            usageCount: admin.usageCount || 0
        }));
    } catch (error) {
        console.error('Failed to fetch permissions matrix:', error);
        window.dashboard.showToast('Could not load permissions', 'warning');
        return [];
    }
}

function showUserPermissions(userId) {
    window.dashboard.showToast(`Edit permissions for user ${userId} (Coming soon)`, 'info');
}

// Make showUserPermissions available globally
window.showUserPermissions = showUserPermissions;

function showGroupDetails(group) {
    createModal({
        title: 'Group Details',
        content: `
            <div style="display: flex; flex-direction: column; gap: 16px;">
                <div>
                    <div style="color: var(--text-secondary); font-size: 0.75rem; margin-bottom: 4px;">Group ID</div>
                    <div style="color: var(--text-primary); font-family: var(--font-mono); font-size: 0.875rem;">${group.id}</div>
                </div>
                <div>
                    <div style="color: var(--text-secondary); font-size: 0.75rem; margin-bottom: 4px;">Platform</div>
                    <div style="color: var(--text-primary);">${getPlatformIcon(group.platform)} ${group.platform}</div>
                </div>
                <div>
                    <div style="color: var(--text-secondary); font-size: 0.75rem; margin-bottom: 4px;">Your Role</div>
                    <div>${createRoleBadge(group.role).outerHTML}</div>
                </div>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
                    <div>
                        <div style="color: var(--text-secondary); font-size: 0.75rem; margin-bottom: 4px;">Members</div>
                        <div style="color: var(--text-primary); font-size: 1.5rem; font-weight: 600;">${group.memberCount}</div>
                    </div>
                    <div>
                        <div style="color: var(--text-secondary); font-size: 0.75rem; margin-bottom: 4px;">Admins</div>
                        <div style="color: var(--text-primary); font-size: 1.5rem; font-weight: 600;">${group.adminCount}</div>
                    </div>
                    <div>
                        <div style="color: var(--text-secondary); font-size: 0.75rem; margin-bottom: 4px;">Tools</div>
                        <div style="color: var(--text-primary); font-size: 1.5rem; font-weight: 600;">${group.enabledTools}</div>
                    </div>
                </div>
                <div>
                    <div style="color: var(--text-secondary); font-size: 0.75rem; margin-bottom: 8px;">Status</div>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        ${createStatusBadge(group.active ? 'Active' : 'Inactive', group.active ? 'success' : 'error').outerHTML}
                        ${group.dangerousToolsEnabled ? createBadge({ text: '⚠️ Dangerous Tools Enabled', variant: 'warning', size: 'sm' }).outerHTML : createBadge({ text: '✓ No Dangerous Tools', variant: 'success', size: 'sm' }).outerHTML}
                    </div>
                </div>
            </div>
        `,
        actions: [
            { label: 'Close', className: 'primary' }
        ]
    }).show();
}

// Utility function for time formatting (reuse from analytics)
function formatTime(date) {
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) {
        return 'Just now';
    } else if (diff < 3600000) {
        return Math.floor(diff / 60000) + 'm ago';
    } else if (diff < 86400000) {
        return Math.floor(diff / 3600000) + 'h ago';
    } else {
        return date.toLocaleString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    }
}

// Make loadAdminPage available globally
window.loadAdminPage = loadAdminPage;
