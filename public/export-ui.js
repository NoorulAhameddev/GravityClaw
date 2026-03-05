/**
 * Export Functionality UI Helper
 * Handles UI interactions for data exports
 * Works with both WebSocket (app.js) and API (dashboard) implementations
 */

/**
 * Show export dialog with format options
 */
function showExportDialog(exportType) {
  const title = {
    'chat-history': '📥 Export Chat History',
    'memory': '📥 Export Memory',
    'usage': '📥 Export Usage Stats',
    'graph': '📥 Export Knowledge Graph',
  }[exportType] || 'Export Data';

  const formats = {
    'chat-history': ['json', 'markdown'],
    'memory': ['json', 'markdown'],
    'usage': ['json', 'csv'],
    'graph': ['json', 'graphml'],
  }[exportType] || ['json'];

  const html = `
    <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 9999;" onclick="if(event.target===this) closeExportDialog()">
      <div style="background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 24px; max-width: 500px; width: 90%;">
        <h3 style="margin-bottom: 16px; color: var(--text);">📦 ${title}</h3>
        
        <div style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 8px; color: var(--muted); font-size: 13px;">Format:</label>
          <select id="export-format-select" style="width: 100%; padding: 8px 12px; background: var(--surface2); border: 1px solid var(--border); color: var(--text); border-radius: 6px; font-size: 14px;">
            ${formats.map(f => `<option value="${f}">${f.toUpperCase()}</option>`).join('')}
          </select>
        </div>

        <div style="margin-bottom: 20px;">
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: var(--muted); font-size: 13px;">
            <input type="checkbox" id="export-compress-check" checked style="width: 16px; height: 16px; cursor: pointer;">
            <span>Compress (gzip)</span>
          </label>
        </div>

        <div style="display: flex; gap: 12px; justify-content: flex-end;">
          <button onclick="closeExportDialog()" style="padding: 8px 16px; background: var(--surface2); border: 1px solid var(--border); color: var(--text); border-radius: 6px; cursor: pointer; font-size: 14px;">
            Cancel
          </button>
          <button onclick="executeExport('${exportType}')" style="padding: 8px 16px; background: var(--accent); border: none; color: white; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 14px;">
            Export
          </button>
        </div>
      </div>
    </div>
  `;

  const existing = document.getElementById('export-dialog');
  if (existing) existing.remove();

  const dialog = document.createElement('div');
  dialog.id = 'export-dialog';
  dialog.innerHTML = html;
  document.body.appendChild(dialog);
}

/**
 * Close export dialog
 */
function closeExportDialog() {
  const dialog = document.getElementById('export-dialog');
  if (dialog) dialog.remove();
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
  // Check if toast function already exists (from app.js or index.html)
  if (typeof toast === 'function') {
    toast(message, type);
  } else {
    // Fallback implementation
    const container = document.getElementById('toasts') || createToastContainer();
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    el.style.cssText = `
      padding: 12px 16px;
      margin: 8px;
      border-radius: 6px;
      background: ${type === 'ok' ? '#10b981' : type === 'err' ? '#ef4444' : '#3b82f6'};
      color: white;
      animation: slideIn 0.3s ease-out;
    `;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }
}

function createToastContainer() {
  const box = document.createElement('div');
  box.id = 'toasts';
  box.style.cssText = 'position: fixed; bottom: 20px; right: 20px; z-index: 9998;';
  document.body.appendChild(box);
  
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(400px); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
  
  return box;
}

/**
 * Call tool via WebSocket (app.js) or API
 */
async function callExportTool(toolName, params) {
  // Try WebSocket first (app.js interface)
  if (typeof callTool === 'function' && typeof ws !== 'undefined' && ws?.readyState === WebSocket.OPEN) {
    return await callTool(toolName, params);
  }
  
  // Fallback to API endpoint for server-side execution
  try {
    const response = await fetch('/api/tools/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tool: toolName,
        input: params,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    return await response.json();
  } catch (err) {
    console.error('API call failed:', err);
    throw err;
  }
}

/**
 * Execute export and download file
 */
async function executeExport(exportType) {
  try {
    const format = document.getElementById('export-format-select')?.value || 'json';
    const compress = document.getElementById('export-compress-check')?.checked !== false;
    const sessionId = getCurrentSessionId();

    if (!sessionId) {
      showToast('No active session', 'warn');
      return;
    }

    // Show loading indicator
    showToast('📦 Exporting data...', 'info');

    const toolName = {
      'chat-history': 'exportChatHistory',
      'memory': 'exportMemory',
      'usage': 'exportUsageStats',
      'graph': 'exportGraph',
    }[exportType];

    const params = {
      sessionId,
      format,
      compress,
    };

    // Add type-specific parameters
    if (exportType === 'usage') {
      params.limit = 10000;
    } else if (exportType !== 'graph') {
      params.limit = 1000;
    }

    const result = await callExportTool(toolName, params);

    if (!result?.success) {
      showToast(`❌ Export failed: ${result?.error || 'Unknown error'}`, 'err');
      closeExportDialog();
      return;
    }

    const data = result.data;
    if (!data || !data.base64) {
      if (result.warning) {
        showToast(`⚠️ ${result.warning}`, 'warn');
      } else {
        showToast('✅ Export completed (no data to download)', 'ok');
      }
      closeExportDialog();
      return;
    }

    // Download the file
    downloadFile(data.base64, data.filename);

    // Show success message with details
    const details = [];
    if (data.messageCount !== undefined) details.push(`${data.messageCount} messages`);
    if (data.recordCount !== undefined) details.push(`${data.recordCount} records`);
    if (data.stats?.facts !== undefined) details.push(`${data.stats.facts} facts`);
    if (data.stats?.entities !== undefined) details.push(`${data.stats.entities} entities`);
    if (data.summary?.totalRecords !== undefined) details.push(`$${data.summary.totalCost?.toFixed(2) || '0'} cost`);

    const message = `✅ Downloaded ${data.filename}${details.length > 0 ? ` • ${details.join(' • ')}` : ''}`;
    showToast(message, 'ok');

    closeExportDialog();
  } catch (err) {
    console.error('Export error:', err);
    showToast(`❌ Export failed: ${err.message}`, 'err');
  }
}

/**
 * Download file from base64 data
 */
function downloadFile(base64Data, filename) {
  try {
    const buffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Download error:', err);
    showToast(`Failed to download file: ${err.message}`, 'err');
  }
}

/**
 * Get current session ID from LocalStorage or URL
 */
function getCurrentSessionId() {
  // Try to get from localStorage
  const stored = localStorage.getItem('gravityclaw-session-id');
  if (stored) return stored;

  // Try from URL hash
  const hash = window.location.hash.substring(1);
  if (hash && hash !== 'overview' && hash !== 'chat') return hash;

  // Fall back to a reasonable default
  return `session-${Date.now()}`;
}

/**
 * Add export buttons to settings section (for dashboard)
 */
function addExportButtonsToSettings() {
  const settingsSection = document.getElementById('settings-section');
  if (!settingsSection || document.getElementById('export-buttons-container')) {
    return;
  }

  const exportContainer = document.createElement('div');
  exportContainer.id = 'export-buttons-container';
  exportContainer.style.cssText = 'margin-top: 28px;';
  exportContainer.innerHTML = `
    <div class="section-title" style="color: var(--text); font-size: 14px; font-weight: 600; margin-bottom: 12px;">📦 Data Export</div>
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px;">
      <button class="export-btn" onclick="showExportDialog('chat-history')" title="Export conversation history" style="padding: 10px 12px; background: var(--surface2); border: 1px solid var(--border); color: var(--text); border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500; transition: all 0.2s ease;">
        💬 Chat History
      </button>
      <button class="export-btn" onclick="showExportDialog('memory')" title="Export facts and entities" style="padding: 10px 12px; background: var(--surface2); border: 1px solid var(--border); color: var(--text); border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500; transition: all 0.2s ease;">
        🧠 Memory
      </button>
      <button class="export-btn" onclick="showExportDialog('usage')" title="Export usage and costs" style="padding: 10px 12px; background: var(--surface2); border: 1px solid var(--border); color: var(--text); border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500; transition: all 0.2s ease;">
        📊 Usage Stats
      </button>
      <button class="export-btn" onclick="showExportDialog('graph')" title="Export knowledge graph" style="padding: 10px 12px; background: var(--surface2); border: 1px solid var(--border); color: var(--text); border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500; transition: all 0.2s ease;">
        🔗 Graph
      </button>
    </div>
  `;

  settingsSection.appendChild(exportContainer);

  // Add hover effects via style
  const style = document.createElement('style');
  style.textContent = `
    .export-btn:hover {
      background: var(--accent);
      border-color: var(--accent);
      color: white;
      transform: translateY(-2px);
    }
    .export-btn:active {
      transform: translateY(0);
    }
  `;
  if (!document.getElementById('export-btn-styles')) {
    style.id = 'export-btn-styles';
    document.head.appendChild(style);
  }
}

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    // For dashboard (index.html)
    addExportButtonsToSettings();
  }, 500);
});

// Make functions globally available
window.showExportDialog = showExportDialog;
window.closeExportDialog = closeExportDialog;
window.executeExport = executeExport;
window.getCurrentSessionId = getCurrentSessionId;
