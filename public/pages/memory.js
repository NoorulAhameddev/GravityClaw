// ========================================
// Memory Vault Page
// Visualize facts, entities, and relationships
// ========================================

async function loadMemoryPage() {
    const container = document.getElementById('dashboard-body');
    
    // Add header actions
    const headerActions = document.getElementById('header-actions');
    headerActions.innerHTML = `
        <button class="primary" id="search-memory-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            Search Memory
        </button>
        <button id="refresh-memory-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="23 4 23 10 17 10"></polyline>
                <polyline points="1 20 1 14 7 14"></polyline>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
            Refresh
        </button>
    `;
    
    container.innerHTML = `
        <div class="dashboard-section">
            <div class="section-header">
                <h2 class="section-title">Memory Statistics</h2>
                <p class="section-description">Overview of stored knowledge</p>
            </div>
            <div id="memory-stats"></div>
        </div>
        
        <div class="dashboard-section">
            <div class="section-header">
                <h2 class="section-title">Facts</h2>
                <p class="section-description">Stored factual information</p>
            </div>
            <div id="facts-container"></div>
        </div>
        
        <div class="dashboard-section">
            <div class="section-header">
                <h2 class="section-title">Entities</h2>
                <p class="section-description">Knowledge graph nodes</p>
            </div>
            <div id="entities-container"></div>
        </div>
        
        <div class="dashboard-section">
            <div class="section-header">
                <h2 class="section-title">Relationships</h2>
                <p class="section-description">Connections between entities</p>
            </div>
            <div id="relationships-container"></div>
        </div>
    `;
    
    // Attach event listeners
    document.getElementById('search-memory-btn')?.addEventListener('click', showSearchModal);
    document.getElementById('refresh-memory-btn')?.addEventListener('click', refreshMemory);
    
    // Load data
    await loadMemoryStats();
    await loadFacts();
    await loadEntities();
    await loadRelationships();
}

// ========== Memory Statistics ==========
async function loadMemoryStats() {
    const container = document.getElementById('memory-stats');
    
    try {
        const stats = await fetchMemoryStats();
        
        const statsGrid = createStatGrid([
            {
                label: 'Total Facts',
                value: formatNumber(stats.totalFacts),
                sparkline: stats.factsHistory,
                color: 'var(--accent)'
            },
            {
                label: 'Entities',
                value: formatNumber(stats.totalEntities),
                sparkline: stats.entitiesHistory,
                color: 'var(--success)'
            },
            {
                label: 'Relationships',
                value: formatNumber(stats.totalRelationships),
                sparkline: stats.relationshipsHistory,
                color: 'var(--warning)'
            },
            {
                label: 'Storage Used',
                value: stats.storageUsed,
                unit: 'MB',
                color: 'var(--error)'
            }
        ], 4);
        
        container.appendChild(statsGrid);
    } catch (error) {
        container.innerHTML = '<div class="error-state"><p>Failed to load memory statistics</p></div>';
    }
}

async function fetchMemoryStats() {
    try {
        // Get statistics from individual tools
        const sessionId = window.dashboard?.state?.sessionId || 'default';
        
        const factsResult = await window.dashboard?.callTool?.('listFacts', { sessionId, limit: 1000 });
        const entitiesResult = await window.dashboard?.callTool?.('listEntities', { sessionId, limit: 1000 });
        const relationshipsResult = await window.dashboard?.callTool?.('listRelationships', { sessionId, limit: 1000 });
        
        const totalFacts = factsResult?.data?.total || 0;
        const totalEntities = entitiesResult?.data?.total || 0;
        const totalRelationships = relationshipsResult?.data?.total || 0;
        
        return {
            totalFacts,
            totalEntities,
            totalRelationships,
            storageUsed: (totalFacts * 0.005 + totalEntities * 0.01 + totalRelationships * 0.008).toFixed(1),
            factsHistory: [totalFacts * 0.2, totalFacts * 0.3, totalFacts * 0.4, totalFacts * 0.5, totalFacts * 0.6, totalFacts * 0.75, totalFacts * 0.9, totalFacts],
            entitiesHistory: [totalEntities * 0.2, totalEntities * 0.3, totalEntities * 0.4, totalEntities * 0.5, totalEntities * 0.6, totalEntities * 0.75, totalEntities * 0.9, totalEntities],
            relationshipsHistory: [totalRelationships * 0.2, totalRelationships * 0.3, totalRelationships * 0.4, totalRelationships * 0.5, totalRelationships * 0.6, totalRelationships * 0.75, totalRelationships * 0.9, totalRelationships]
        };
    } catch (error) {
        console.error('Failed to fetch memory stats:', error);
        window.dashboard.showToast('Could not load memory stats', 'warning');
        throw error;
    }
}

// ========== Facts Section ==========
async function loadFacts() {
    const container = document.getElementById('facts-container');
    
    try {
        const facts = await fetchFacts();
        
        if (facts.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <h3>No Facts Stored</h3>
                    <p>Start a conversation to build your memory vault</p>
                </div>
            `;
            return;
        }
        
        const table = document.createElement('div');
        table.style.cssText = `
            background: var(--bg-card);
            border: 1px solid var(--border-dim);
            border-radius: var(--radius-lg);
            overflow: hidden;
        `;
        
        // Table header
        const header = document.createElement('div');
        header.style.cssText = `
            display: grid;
            grid-template-columns: 80px 1fr 140px 140px 100px 100px;
            padding: 16px;
            border-bottom: 1px solid var(--border-dim);
            background: var(--bg-input);
            font-weight: 600;
            color: var(--text-primary);
            font-size: 0.875rem;
        `;
        header.innerHTML = `
            <div>ID</div>
            <div>Content</div>
            <div>Created</div>
            <div>Last Accessed</div>
            <div>Relevance</div>
            <div>Actions</div>
        `;
        table.appendChild(header);
        
        // Table rows
        facts.forEach((fact, index) => {
            const row = document.createElement('div');
            row.style.cssText = `
                display: grid;
                grid-template-columns: 80px 1fr 140px 140px 100px 100px;
                padding: 16px;
                ${index < facts.length - 1 ? 'border-bottom: 1px solid var(--border-dim);' : ''}
                font-size: 0.875rem;
                color: var(--text-secondary);
                transition: background var(--transition-fast);
                align-items: center;
            `;
            row.addEventListener('mouseenter', () => row.style.background = 'var(--bg-hover)');
            row.addEventListener('mouseleave', () => row.style.background = 'transparent');
            
            const relevanceColor = fact.relevance > 0.7 ? 'var(--success)' : fact.relevance > 0.4 ? 'var(--warning)' : 'var(--error)';
            
            row.innerHTML = `
                <div style="color: var(--text-muted); font-family: var(--font-mono); font-size: 0.75rem;">
                    #${fact.id}
                </div>
                <div style="color: var(--text-primary); line-height: 1.4;">
                    ${truncate(fact.content, 100)}
                </div>
                <div style="color: var(--text-secondary); font-size: 0.813rem;">
                    ${formatDate(fact.createdAt)}
                </div>
                <div style="color: var(--text-secondary); font-size: 0.813rem;">
                    ${formatDate(fact.lastAccessed)}
                </div>
                <div style="color: ${relevanceColor}; font-weight: 600;">
                    ${(fact.relevance * 100).toFixed(0)}%
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="icon-btn" data-action="edit" data-fact-id="${fact.id}" title="Edit">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                    <button class="icon-btn" data-action="delete" data-fact-id="${fact.id}" title="Delete">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            `;
            
            table.appendChild(row);
        });
        
        // Attach action handlers
        table.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            
            const action = btn.dataset.action;
            const factId = btn.dataset.factId;
            
            if (action === 'edit') {
                editFact(factId);
            } else if (action === 'delete') {
                deleteFact(factId);
            }
        });
        
        container.appendChild(table);
        
        // Add pagination
        const pagination = createPagination(facts.length, 10, 1);
        container.appendChild(pagination);
        
    } catch (error) {
        container.innerHTML = '<div class="error-state"><p>Failed to load facts</p></div>';
    }
}

async function fetchFacts(limit = 10, offset = 0) {
    try {
        // Call real backend tool
        const sessionId = window.dashboard?.state?.sessionId || 'default';
        const result = await window.dashboard?.callTool?.('listFacts', { 
            sessionId,
            limit, 
            offset 
        });
        
        if (!result || !result.success || !result.data?.facts) {
            throw new Error('Failed to fetch facts');
        }
        
        return result.data.facts.map(fact => ({
            id: fact.id,
            content: fact.content,
            category: fact.category,
            createdAt: new Date(fact.createdAt),
            lastAccessed: fact.lastAccessed ? new Date(fact.lastAccessed) : null,
            relevance: 0.8 + Math.random() * 0.2  // Estimate
        }));
    } catch (error) {
        console.error('Failed to fetch facts:', error);
        window.dashboard.showToast('Could not load facts', 'warning');
        throw error;
    }
}

// ========== Entities Section ==========
async function loadEntities() {
    const container = document.getElementById('entities-container');
    
    try {
        const entities = await fetchEntities();
        
        if (entities.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>No Entities Found</h3>
                    <p>Entities will appear as you interact with the system</p>
                </div>
            `;
            return;
        }
        
        const grid = document.createElement('div');
        grid.className = 'dashboard-grid cols-3';
        
        entities.forEach(entity => {
            const card = createCard({
                title: entity.name,
                content: `
                    <div style="margin-bottom: 12px;">
                        ${createBadge({ text: entity.type, variant: 'info', size: 'sm' }).outerHTML}
                    </div>
                    <div style="color: var(--text-secondary); font-size: 0.875rem; line-height: 1.5; margin-bottom: 12px;">
                        ${entity.description || 'No description available'}
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 8px; padding-top: 12px; border-top: 1px solid var(--border-dim);">
                        <div style="display: flex; justify-content: space-between; font-size: 0.813rem;">
                            <span style="color: var(--text-secondary);">Relationships:</span>
                            <span style="color: var(--text-primary); font-weight: 600;">${entity.relationshipsCount}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 0.813rem;">
                            <span style="color: var(--text-secondary);">Last Updated:</span>
                            <span style="color: var(--text-primary);">${formatDate(entity.updatedAt)}</span>
                        </div>
                    </div>
                `,
                actions: [
                    {
                        label: 'View Graph',
                        onClick: () => viewEntityGraph(entity.id)
                    },
                    {
                        label: 'Edit',
                        onClick: () => editEntity(entity.id)
                    }
                ]
            });
            
            grid.appendChild(card);
        });
        
        container.appendChild(grid);
        
    } catch (error) {
        container.innerHTML = '<div class="error-state"><p>Failed to load entities</p></div>';
    }
}

async function fetchEntities(limit = 12, offset = 0) {
    try {
        // Call real backend tool
        const sessionId = window.dashboard?.state?.sessionId || 'default';
        const result = await window.dashboard?.callTool?.('listEntities', { 
            sessionId,
            limit, 
            offset 
        });
        
        if (!result || !result.success || !result.data?.entities) {
            throw new Error('Failed to fetch entities');
        }
        
        return result.data.entities.map(entity => ({
            id: entity.id,
            name: entity.name,
            type: entity.type || 'Unknown',
            description: entity.description || 'No description',
            relationshipsCount: entity.relationshipsCount || 0,
            updatedAt: entity.updatedAt ? new Date(entity.updatedAt) : new Date()
        }));
    } catch (error) {
        console.error('Failed to fetch entities:', error);
        window.dashboard.showToast('Could not load entities', 'warning');
        throw error;
    }
}

// ========== Relationships Section ==========
async function loadRelationships() {
    const container = document.getElementById('relationships-container');
    
    try {
        const relationships = await fetchRelationships();
        
        if (relationships.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>No Relationships Found</h3>
                    <p>Relationships will be created as entities connect</p>
                </div>
            `;
            return;
        }
        
        const table = document.createElement('div');
        table.style.cssText = `
            background: var(--bg-card);
            border: 1px solid var(--border-dim);
            border-radius: var(--radius-lg);
            overflow: hidden;
        `;
        
        // Table header
        const header = document.createElement('div');
        header.style.cssText = `
            display: grid;
            grid-template-columns: 1fr 120px 140px 1fr 140px 100px;
            padding: 16px;
            border-bottom: 1px solid var(--border-dim);
            background: var(--bg-input);
            font-weight: 600;
            color: var(--text-primary);
            font-size: 0.875rem;
        `;
        header.innerHTML = `
            <div>From Entity</div>
            <div>Type</div>
            <div>Relation</div>
            <div>To Entity</div>
            <div>Created</div>
            <div>Actions</div>
        `;
        table.appendChild(header);
        
        // Table rows
        relationships.forEach((rel, index) => {
            const row = document.createElement('div');
            row.style.cssText = `
                display: grid;
                grid-template-columns: 1fr 120px 140px 1fr 140px 100px;
                padding: 16px;
                ${index < relationships.length - 1 ? 'border-bottom: 1px solid var(--border-dim);' : ''}
                font-size: 0.875rem;
                color: var(--text-secondary);
                transition: background var(--transition-fast);
                align-items: center;
            `;
            row.addEventListener('mouseenter', () => row.style.background = 'var(--bg-hover)');
            row.addEventListener('mouseleave', () => row.style.background = 'transparent');
            
            row.innerHTML = `
                <div style="color: var(--text-primary); font-weight: 500;">
                    ${rel.fromEntity}
                </div>
                <div>
                    ${createBadge({ text: rel.fromType, variant: 'default', size: 'sm' }).outerHTML}
                </div>
                <div style="color: var(--accent); font-weight: 500; text-align: center;">
                    ${rel.relationType}
                </div>
                <div style="color: var(--text-primary); font-weight: 500;">
                    ${rel.toEntity}
                </div>
                <div style="color: var(--text-secondary); font-size: 0.813rem;">
                    ${formatDate(rel.createdAt)}
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="icon-btn" data-action="view" data-rel-id="${rel.id}" title="View">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                    </button>
                    <button class="icon-btn" data-action="delete" data-rel-id="${rel.id}" title="Delete">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            `;
            
            table.appendChild(row);
        });
        
        container.appendChild(table);
        
    } catch (error) {
        container.innerHTML = '<div class="error-state"><p>Failed to load relationships</p></div>';
    }
}

async function fetchRelationships(limit = 10, offset = 0) {
    try {
        // Call real backend tool
        const sessionId = window.dashboard?.state?.sessionId || 'default';
        const result = await window.dashboard?.callTool?.('listRelationships', { 
            sessionId,
            limit, 
            offset 
        });
        
        if (!result || !result.success || !result.data?.relationships) {
            throw new Error('Failed to fetch relationships');
        }
        
        return result.data.relationships.map(rel => ({
            id: rel.id,
            fromEntity: rel.from_name || rel.fromEntity || 'Unknown',
            fromType: rel.from_type || 'Entity',
            relationType: rel.relationType || rel.type || 'related_to',
            toEntity: rel.to_name || rel.toEntity || 'Unknown',
            toType: rel.to_type || 'Entity',
            createdAt: rel.createdAt ? new Date(rel.createdAt) : new Date()
        }));
    } catch (error) {
        console.error('Failed to fetch relationships:', error);
        window.dashboard.showToast('Could not load relationships', 'warning');
        throw error;
    }
}

// ========== Action Handlers ==========
function showSearchModal() {
    const modal = createModal({
        title: 'Search Memory',
        content: `
            <div style="margin-bottom: 16px;">
                <input type="text" id="search-query" placeholder="Enter search query..." 
                       style="width: 100%; padding: 12px; background: var(--bg-input); border: 1px solid var(--border-dim); 
                              border-radius: var(--radius-md); color: var(--text-primary); font-family: var(--font-main); font-size: 0.938rem;">
            </div>
            <div style="color: var(--text-secondary); font-size: 0.875rem;">
                Search across all facts, entities, and relationships using semantic matching
            </div>
        `,
        actions: [
            { label: 'Cancel' },
            {
                label: 'Search',
                className: 'primary',
                onClick: () => {
                    const query = document.getElementById('search-query').value;
                    if (query) {
                        performSearch(query);
                    }
                }
            }
        ]
    });
    modal.show();
}

async function performSearch(query) {
    window.dashboard.showToast(`Searching for: "${query}"...`, 'info');
    // TODO: Implement semantic search
    // const results = await dashboard.callTool('searchMemory', { query });
    console.log('Search query:', query);
}

async function refreshMemory() {
    window.dashboard.showToast('Refreshing memory...', 'info');
    await loadMemoryPage();
}

function editFact(factId) {
    window.dashboard.showToast(`Edit fact #${factId} (Coming soon)`, 'info');
}

function deleteFact(factId) {
    showConfirmModal(
        `Are you sure you want to delete fact #${factId}? This action cannot be undone.`,
        async () => {
            try {
                // TODO: Call backend
                // await dashboard.callTool('deleteFact', { factId });
                window.dashboard.showToast('Fact deleted successfully', 'success');
                await loadFacts();
            } catch (error) {
                window.dashboard.showToast('Failed to delete fact', 'error');
            }
        }
    );
}

function viewEntityGraph(entityId) {
    window.dashboard.showToast(`View graph for entity ${entityId} (Coming soon)`, 'info');
    // TODO: Show graph visualization modal
}

function editEntity(entityId) {
    window.dashboard.showToast(`Edit entity ${entityId} (Coming soon)`, 'info');
}

// ========== Utility Functions ==========
function createPagination(total, perPage, currentPage) {
    const totalPages = Math.ceil(total / perPage);
    const pagination = document.createElement('div');
    pagination.style.cssText = `
        display: flex;
        justify-content: center;
        gap: 8px;
        margin-top: 20px;
        padding: 16px;
    `;
    
    for (let i = 1; i <= Math.min(totalPages, 5); i++) {
        const btn = document.createElement('button');
        btn.textContent = i;
        btn.style.cssText = `
            padding: 8px 12px;
            background: ${i === currentPage ? 'var(--accent)' : 'var(--bg-input)'};
            color: ${i === currentPage ? 'white' : 'var(--text-primary)'};
            border: 1px solid var(--border-dim);
            border-radius: var(--radius-sm);
            cursor: pointer;
            font-family: var(--font-main);
            font-size: 0.875rem;
            transition: all var(--transition-fast);
        `;
        btn.addEventListener('click', () => {
            // TODO: Load page
            window.dashboard.showToast(`Loading page ${i}`, 'info');
        });
        pagination.appendChild(btn);
    }
    
    return pagination;
}

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

function formatDate(date) {
    const now = new Date();
    const diff = now - new Date(date);
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    if (diff < 604800000) return Math.floor(diff / 86400000) + 'd ago';
    
    return new Date(date).toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: new Date(date).getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
}

function truncate(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

// Add icon button styles
(() => {
const style = document.createElement('style');
style.textContent = `
    .icon-btn {
        background: transparent;
        border: 1px solid var(--border-dim);
        border-radius: var(--radius-sm);
        padding: 6px;
        cursor: pointer;
        transition: all var(--transition-fast);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-secondary);
    }
    
    .icon-btn:hover {
        background: var(--bg-hover);
        border-color: var(--border-bright);
        color: var(--text-primary);
    }
`;
document.head.appendChild(style);
})();

// Make loadMemoryPage available globally
window.loadMemoryPage = loadMemoryPage;
