// ─────────────────────────────────────────────
//  Gravity Claw  — Web UI App — Enhanced
// ─────────────────────────────────────────────

window.onerror = function (msg, url, line, col, error) {
  console.error("GLOBAL ERROR:", msg, "at", url, ":", line, ":", col, error);
  return false;
};

function fmtUptime(seconds) {
  if (!seconds || isNaN(seconds)) return '0s';
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 || parts.length === 0) parts.push(`${s}s`);
  return parts.join(' ');
}
window.fmtUptime = fmtUptime;

// ── Router ──────────────────────────────────
const PAGES = ['overview', 'chat', 'canvas', 'scheduler', 'webhooks', 'heartbeats', 'sessions', 'memory', 'analytics', 'swarms', 'workflows', 'tools', 'usage', 'admin', 'plugins'];
let currentPage = 'overview';

// already moved to top

function navigate(page) {
  if (!PAGES.includes(page)) return;
  if (currentPage === page) return;

  const oldPage = currentPage;
  currentPage = page;

  PAGES.forEach(p => {
    const el = document.getElementById(`page-${p}`);
    const nav = document.querySelector(`[data-page="${p}"]`);
    if (el) el.classList.toggle('active', p === page);
    if (nav) nav.classList.toggle('active', p === page);
  });

  // Page-specific actions
  if (page === 'overview') loadOverview();
  if (page === 'memory') loadMemory();
  if (page === 'tools') loadTools();
  if (page === 'scheduler') loadScheduler();
  if (page === 'webhooks') loadWebhooks();
  if (page === 'heartbeats') loadHeartbeats();
  if (page === 'sessions') loadSessions();
  if (page === 'swarms') loadSwarms();
  if (page === 'workflows') loadWorkflows();
  if (page === 'usage') loadUsage();
  if (page === 'admin') loadAdmin();

  document.title = `Gravity Claw — ${page.charAt(0).toUpperCase() + page.slice(1)}`;
  const titleEl = document.querySelector('.page-header .page-title') || document.getElementById('page-title') || document.querySelector('.page-title');
  if (titleEl) titleEl.textContent = page.charAt(0).toUpperCase() + page.slice(1);
  window.location.hash = page;
}

document.querySelectorAll('[data-page]').forEach(el => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    navigate(el.dataset.page);
  });
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey) {
    if (e.key === '1') { e.preventDefault(); navigate('chat'); }
    if (e.key === '2') { e.preventDefault(); navigate('dashboard'); }
    if (e.key === '3') { e.preventDefault(); navigate('memory'); }
  }
});

// ── WebSocket (chat) ─────────────────────────
let ws, wsDelay = 1000, wsTimer;
const WS_MAX_DELAY = 10000;

function wsConnect() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}`);

  ws.onopen = () => {
    clearTimeout(wsTimer);
    wsDelay = 1000;

    // Update all WS status indicators
    updateStatus('ws', 'ok', 'Connected');

    const sendBtn = document.getElementById('chat-send');
    if (sendBtn) sendBtn.disabled = false;
    toast('Connected to server', 'ok');
  };

  ws.onmessage = enhancedMessageHandler;

  ws.onclose = () => {
    updateStatus('ws', '', 'Disconnected');

    const sendBtn = document.getElementById('chat-send');
    if (sendBtn) sendBtn.disabled = true;

    wsTimer = setTimeout(() => {
      wsDelay = Math.min(wsDelay * 1.5, WS_MAX_DELAY);
      wsConnect();
    }, wsDelay);
  };

  ws.onerror = (e) => {
    updateStatus('ws', 'warn', 'Error');
    console.error('WebSocket error:', e);
  };
}

function updateStatus(type, state, msg) {
  // Map state to CSS classes used in index.html
  const clsMap = { 'ok': 'green', 'err': 'red', 'warn': 'yellow', 'connecting': 'yellow' };
  const cssCls = clsMap[state] || '';

  // Update dots
  const dots = {
    ws: ['ws-dot', 'ws-clients-dot'],
    server: ['server-dot'],
    canvas: ['canvas-dot']
  }[type] || [];

  dots.forEach(id => setDot(id, cssCls));

  // Update texts
  const texts = {
    ws: ['ws-status', 'ws-status-text', 'chat-ws-status'],
    server: ['server-status', 'server-status-text', 'status-value'],
    canvas: ['canvas-status']
  }[type] || [];

  texts.forEach(id => setText(id, msg));

  // Update status-icon in the dashboard banner if it exists
  if (type === 'server') {
    const icon = document.getElementById('status-icon');
    if (icon) icon.style.color = state === 'ok' ? 'var(--green)' : 'var(--red)';
  }
}

// ── Tool Call Helper ─────────────────────────
const pendingToolCalls = new Map();

function callTool(toolName, args = {}) {
  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reject(new Error('WebSocket not connected'));
      return;
    }

    const id = `tool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const timeout = setTimeout(() => {
      pendingToolCalls.delete(id);
      reject(new Error(`Tool call timeout: ${toolName}`));
    }, 30000);

    pendingToolCalls.set(id, { resolve, reject, timeout });

    ws.send(JSON.stringify({
      type: 'tool_call',
      id,
      tool: toolName,
      args
    }));
  });
}

// Enhanced message handler to process tool responses
const originalOnMessage = ws?.onmessage;
function enhancedMessageHandler(event) {
  try {
    const m = JSON.parse(event.data);

    // Handle tool responses
    if (m.type === 'tool_response' && m.id) {
      const pending = pendingToolCalls.get(m.id);
      if (pending) {
        clearTimeout(pending.timeout);
        pendingToolCalls.delete(m.id);

        if (m.error) {
          pending.reject(new Error(m.error));
        } else {
          // Parse result if it's JSON string
          let result = m.result;
          if (typeof result === 'string') {
            try {
              result = JSON.parse(result);
            } catch {
              // Keep as string if not JSON
            }
          }
          pending.resolve(result);
        }
      }
      return;
    }

    // Handle chat messages and typing indicators
    if (m.type === 'typing') {
      showTyping(true);
      return;
    }
    if (m.type === 'message' && m.isBot) {
      showTyping(false);
      appendMsg('bot', m.text);
    }
  } catch (e) {
    console.error('Message parse error:', e);
  }
}

// ── Chat ─────────────────────────────────────
function appendMsg(role, text) {
  const wrap = document.getElementById('chat-messages');
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const icon = role === 'user' ? '👤' : '🦾';
  const el = document.createElement('div');
  el.className = `msg ${role}`;
  el.innerHTML = `
    <div class="msg-av">${icon}</div>
    <div class="msg-body">
      <div class="msg-bub">${esc(text)}</div>
      <div class="msg-time">${time}</div>
    </div>`;
  wrap.appendChild(el);

  // Smooth scroll to bottom
  wrap.scrollTop = wrap.scrollHeight;

  // Add subtle feedback
  el.offsetHeight; // Trigger reflow
}

function showTyping(on) {
  const el = document.getElementById('chat-typing');
  if (on) {
    el.innerHTML = `
      <span>Agent is thinking</span>
      <div class="tdots">
        <span></span>
        <span></span>
        <span></span>
      </div>`;
  } else {
    el.innerHTML = '';
  }
}

const chatForm = document.getElementById('chat-form');
const chatTa = document.getElementById('chat-ta');

chatForm.addEventListener('submit', e => {
  e.preventDefault();
  const text = chatTa.value.trim();
  if (!text || !ws || ws.readyState !== WebSocket.OPEN) {
    toast('Not connected', 'err');
    return;
  }

  appendMsg('user', text);
  ws.send(JSON.stringify({ type: 'message', text }));
  chatTa.value = '';
  chatTa.style.height = 'auto';
  chatTa.focus();
});

chatTa.addEventListener('input', () => {
  chatTa.style.height = 'auto';
  chatTa.style.height = Math.min(chatTa.scrollHeight, 120) + 'px';
});

chatTa.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    chatForm.requestSubmit();
  }
});

document.getElementById('clear-btn')?.addEventListener('click', () => {
  if (confirm('Clear all messages?')) {
    document.getElementById('chat-messages').innerHTML = '';
    showTyping(false);
    toast('Chat cleared', 'info');
  }
});

// ── Dashboard ────────────────────────────────
async function loadOverview() {
  try {
    const [health, stats, usage] = await Promise.all([
      api('/api/health'),
      api('/api/stats'),
      api('/api/usage')
    ]);

    // Update overview statuses
    updateStatus('server', health.status === 'ok' ? 'ok' : 'err', health.status === 'ok' ? 'Online' : 'Error');
    set('uptime-value', fmtUptime(health.uptime));
    set('ws-clients-value', health.server?.wsClients ?? 0);
    set('port-value', health.server?.port ?? 3000);

    // Update stats cards
    const s = stats.data || {};
    set('st-sessions', s.sessions);
    set('st-tasks', s.activeTasks);
    set('st-memory', s.memorySessions);
    set('st-swarms', s.swarms);
    set('st-workflows', s.workflows);
    set('st-webhooks', s.webhooks);

    // Update usage cards
    const u = usage.byPeriod?.today || {};
    set('usage-today-reqs', u.requests ?? 0);
    set('usage-today-cost', `$${(u.cost || 0).toFixed(4)}`);

    const uw = usage.byPeriod?.week || {};
    set('usage-week-reqs', uw.requests ?? 0);
    set('usage-week-cost', `$${(uw.cost || 0).toFixed(4)}`);

    const ua = usage.byPeriod?.allTime || {};
    set('usage-all-reqs', ua.requests ?? 0);
    set('usage-all-cost', `$${(ua.cost || 0).toFixed(4)}`);

    set('usage-tokens', ua.tokens ?? 0);
    set('usage-latency', `${Math.round(usage.avgLatency || 0)}ms avg`);

  } catch (err) {
    console.error('Overview load error:', err);
    updateStatus('server', 'err', 'Offline');
  }
}

async function loadHealth() {
  try {
    const h = await api('/api/health');
    updateStatus('server', h.status === 'ok' ? 'ok' : 'err', h.status === 'ok' ? 'Server Online' : 'Server Error');
  } catch {
    updateStatus('server', 'err', 'Server Offline');
  }
}

async function loadScheduler() {
  const tb = document.getElementById('tb-scheduler');
  if (!tb) return;
  try {
    const { data } = await api('/api/scheduler/tasks');
    set('sched-stat-total', data.length);
    if (!data.length) { tb.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px">No tasks found</td></tr>'; return; }
    tb.innerHTML = data.map(t => `<tr>
      <td>${esc(t.name)}</td><td style="font-family:monospace">${esc(t.cron_expression)}</td>
      <td style="font-family:monospace">${esc(t.session_id)}</td>
      <td><span class="status-badge ${t.enabled ? 'online' : 'offline'}">${t.enabled ? 'Enabled' : 'Disabled'}</span></td>
      <td>${fmtDate(t.last_run)}</td><td>${fmtDate(t.next_run)}</td><td>${fmtDate(t.created_at)}</td>
    </tr>`).join('');
  } catch (e) { tb.innerHTML = `<tr><td colspan="7">Error: ${e.message}</td></tr>`; }
}

async function loadWebhooks() {
  const tb = document.getElementById('tb-webhooks');
  if (!tb) return;
  try {
    const { data } = await api('/api/webhooks');
    set('wh-stat-total', data.length);
    if (!data.length) { tb.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px">No webhooks</td></tr>'; return; }
    const origin = window.location.origin;
    tb.innerHTML = data.map(w => {
      const url = `${origin}/webhook/${w.session_id}/${encodeURIComponent(w.name)}`;
      return `<tr><td>${esc(w.name)}</td><td style="font-family:monospace">${esc(w.session_id)}</td>
        <td style="font-family:monospace;max-width:200px;overflow:hidden;text-overflow:ellipsis">${esc(url)}</td>
        <td><button class="btn sm" onclick="copyToClipboard('${esc(url)}')">Copy</button></td>
        <td>${fmtDate(w.created_at)}</td></tr>`;
    }).join('');
  } catch (e) { tb.innerHTML = `<tr><td colspan="5">Error: ${e.message}</td></tr>`; }
}

async function loadHeartbeats() {
  const tb = document.getElementById('tb-heartbeats');
  if (!tb) return;
  try {
    const { data } = await api('/api/heartbeats');
    set('hb-stat-total', data.length);
    if (!data.length) { tb.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px">No heartbeats</td></tr>'; return; }
    tb.innerHTML = data.map(h => `<tr>
      <td style="font-family:monospace">${esc(h.session_id)}</td><td>${h.interval_minutes}m</td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis" title="${esc(h.prompt)}">${esc(h.prompt)}</td>
      <td><span class="status-badge ${h.enabled ? 'online' : 'offline'}">${h.enabled ? 'Enabled' : 'Disabled'}</span></td>
      <td>${fmtDate(h.last_run)}</td><td>${fmtDate(h.created_at)}</td>
    </tr>`).join('');
  } catch (e) { tb.innerHTML = `<tr><td colspan="6">Error: ${e.message}</td></tr>`; }
}

async function loadSessions() {
  const tb = document.getElementById('tb-sessions');
  if (!tb) return;
  try {
    const { data } = await api('/api/sessions');
    set('sess-stat-total', data.length);
    if (!data.length) { tb.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px">No sessions</td></tr>'; return; }
    tb.innerHTML = data.map(s => `<tr>
      <td style="font-family:monospace">${esc(s.id || s.session_id)}</td>
      <td>${s.message_count}</td>
      <td><span class="status-badge ${s.allow_messages ? 'online' : 'offline'}">${s.allow_messages ? 'Active' : 'Stopped'}</span></td>
      <td>${fmtDate(s.updated_at)}</td>
    </tr>`).join('');
  } catch (e) { tb.innerHTML = `<tr><td colspan="4">Error: ${e.message}</td></tr>`; }
}

async function loadSwarms() {
  const tb = document.getElementById('tb-swarms');
  if (!tb) return;
  try {
    const { data } = await api('/api/swarms');
    set('sw-stat-total', data.length);
    if (!data.length) { tb.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px">No swarms</td></tr>'; return; }
    tb.innerHTML = data.map(s => `<tr>
      <td style="font-family:monospace;font-size:11px">${esc(String(s.id).substring(0, 8))}…</td>
      <td style="font-family:monospace">${esc(s.parent_session_id)}</td>
      <td style="font-family:monospace">${esc(s.child_session_id)}</td>
      <td>${esc(s.role)}</td><td><span class="status-badge online">${esc(s.status)}</span></td>
      <td>${fmtDate(s.created_at)}</td>
    </tr>`).join('');
  } catch (e) { tb.innerHTML = `<tr><td colspan="6">Error: ${e.message}</td></tr>`; }
}

async function loadWorkflows() {
  const tb = document.getElementById('tb-workflows');
  if (!tb) return;
  try {
    const { data } = await api('/api/workflows');
    set('wf-stat-total', data.length);
    if (!data.length) { tb.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px">No workflows</td></tr>'; return; }
    tb.innerHTML = data.map(w => {
      const pct = Math.round((w.progress || 0) * 100);
      return `<tr>
        <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis" title="${esc(w.goal)}">${esc(w.goal)}</td>
        <td style="font-family:monospace">${esc(w.session_id)}</td>
        <td><span class="status-badge ${w.status === 'completed' ? 'online' : w.status === 'running' ? 'blue' : 'offline'}">${esc(w.status)}</span></td>
        <td><div style="width:100%;height:6px;background:var(--border);border-radius:3px;overflow:hidden"><div style="width:${pct}%;height:100%;background:var(--accent)"></div></div></td>
        <td>${fmtDate(w.created_at)}</td><td>${fmtDate(w.completed_at)}</td>
      </tr>`;
    }).join('');
  } catch (e) { tb.innerHTML = `<tr><td colspan="6">Error: ${e.message}</td></tr>`; }
}

async function loadUsage() {
  const tb = document.getElementById('tb-models');
  if (!tb) return;
  try {
    const usage = await api('/api/usage');
    const b = usage.byPeriod;
    set('u-today-req', b.today.requests);
    set('u-today-tok', b.today.tokens);
    set('u-today-cost', b.today.cost != null ? `$${Number(b.today.cost).toFixed(4)}` : '—');
    set('u-week-req', b.week.requests);
    set('u-week-tok', b.week.tokens);
    set('u-week-cost', b.week.cost != null ? `$${Number(b.week.cost).toFixed(4)}` : '—');
    set('u-all-req', b.allTime.requests);
    set('u-all-tok', b.allTime.tokens);
    set('u-all-cost', b.allTime.cost != null ? `$${Number(b.allTime.cost).toFixed(4)}` : '—');

    const entries = Object.entries(usage.models || {});
    if (!entries.length) { tb.innerHTML = '<tr><td colspan="4">No data</td></tr>'; return; }
    tb.innerHTML = entries.map(([model, s]) => `<tr>
      <td style="font-family:monospace">${esc(model)}</td><td>${s.calls.toLocaleString()}</td>
      <td>${s.tokens.toLocaleString()}</td><td>$${Number(s.cost).toFixed(4)}</td>
    </tr>`).join('');
  } catch (e) { tb.innerHTML = `<tr><td colspan="4">Error: ${e.message}</td></tr>`; }
}

async function loadAdmin() {
  const container = document.getElementById('admin-groups-container');
  if (!container) return;
  try {
    const groups = await callTool('listGroupsForUser', {});
    if (groups?.success && groups.data?.groups) {
      const list = groups.data.groups;
      set('admin-groups-count', list.length);
      if (list.length === 0) { container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--muted)">No groups found</div>'; return; }
      container.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(300px, 1fr));gap:20px">
        ${list.map(g => `<div class="card" style="padding:20px">
          <div style="font-weight:bold;margin-bottom:10px">📱 ${esc(g.platform)}</div>
          <div style="font-family:monospace;font-size:12px;color:var(--muted)">ID: ${esc(g.groupId)}</div>
          <div style="margin-top:15px;display:flex;justify-content:space-between">
            <span>Tools: <strong style="color:var(--green)">${g.enabledToolCount}</strong> / <strong style="color:var(--red)">${g.disabledToolCount}</strong></span>
          </div>
        </div>`).join('')}
      </div>`;
    }
  } catch (e) { container.innerHTML = `<div style="color:var(--red)">Error: ${e.message}</div>`; }
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => toast('Copied to clipboard', 'ok'));
}
window.copyToClipboard = copyToClipboard;

// ── Memory ───────────────────────────────────
async function loadMemory() {
  const panel = document.getElementById('sess-list');
  panel.innerHTML = loading();
  try {
    const { data } = await api('/api/memory');
    if (!data?.length) {
      panel.innerHTML = empty('🧠', 'No sessions yet');
      return;
    }

    panel.innerHTML = data.map(s => `
      <div class="sess-item" data-sid="${esc(s.session_id)}" onclick="loadMsgs('${esc(s.session_id)}')">
        <div class="sess-id">${esc(s.session_id)}</div>
        <div class="sess-meta">${s.message_count} msgs · ${fmtDate(s.last_active)}</div>
      </div>`).join('');

    loadMsgs(data[0].session_id);
  } catch (e) {
    panel.innerHTML = empty('❌', 'Failed to load');
    console.error('Memory load error:', e);
  }
}

async function loadMsgs(sid) {
  document.querySelectorAll('.sess-item').forEach(el =>
    el.classList.toggle('active', el.dataset.sid === sid));

  const panel = document.getElementById('msgs-panel');
  panel.innerHTML = loading();
  try {
    const { data } = await api(`/api/memory?session=${encodeURIComponent(sid)}&limit=150`);
    if (!data?.length) {
      panel.innerHTML = empty('💬', 'No messages');
      return;
    }

    panel.innerHTML = [...data].reverse().map((row, i) => {
      let msg;
      try { msg = JSON.parse(row.message_json); } catch { return ''; }
      if (!msg) return '';
      const role = msg.role || 'unknown';
      const raw = typeof msg.content === 'string' ? msg.content
        : Array.isArray(msg.content) ? msg.content.filter(c => c.type === 'text').map(c => c.text).join('\n')
          : JSON.stringify(msg.content);
      const preview = (raw || '').substring(0, 600);
      const more = (raw || '').length > 600;
      return `
        <div class="mem-msg">
          <div class="mem-role ${role}">${role.toUpperCase()}</div>
          <div class="mem-content" id="mc-${i}">${esc(preview)}${more ? '…' : ''}</div>
          ${more ? `<span class="mem-expand" onclick="expandMsg('mc-${i}',${JSON.stringify(esc(raw))})">Show more</span>` : ''}
          <div class="mem-time">${fmtDate(row.timestamp)}</div>
        </div>`;
    }).join('');
  } catch (e) {
    panel.innerHTML = empty('❌', 'Failed to load');
    console.error('Messages load error:', e);
  }
}

function expandMsg(id, fullText) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = fullText;
    el.classList.add('expanded');
    el.nextElementSibling?.remove();
  }
}

window.loadMsgs = loadMsgs;
window.expandMsg = expandMsg;

// ── Canvas ───────────────────────────────────
let canWs;

function canConnect() {
  if (canWs) { canWs.close(); canWs = null; }
  let sid = document.getElementById('canvas-sid').value.trim();
  if (!sid) { sid = `web-${Date.now()}`; document.getElementById('canvas-sid').value = sid; }

  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  canWs = new WebSocket(`${proto}//${location.host}/canvas?session=${sid}`);

  canWs.onopen = () => { updateStatus('canvas', 'ok', 'Connected'); };
  canWs.onclose = () => { updateStatus('canvas', '', 'Disconnected'); };
  canWs.onerror = () => { updateStatus('canvas', 'warn', 'Error'); };
  canWs.onmessage = ({ data }) => {
    try {
      const m = JSON.parse(data);
      if (m.type === 'canvas_push') renderCanvas(m.html, m.js);
    } catch (e) {
      console.error('Canvas message error:', e);
    }
  };
}

function renderCanvas(html, js) {
  const frame = document.getElementById('canvas-frame');
  const ph = document.getElementById('canvas-ph');
  const doc = frame.contentDocument || frame.contentWindow.document;
  doc.open();
  doc.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:20px;background:#fff;color:#333;}*{box-sizing:border-box;}h1,h2,h3{margin-top:0;color:#1f2937;}button{cursor:pointer;padding:8px 16px;border-radius:6px;border:1px solid #ddd;background:#fff;transition:all 0.2s;} button:hover{background:#f0f0f0;border-color:#999;}</style>
    </head><body>${html}${js ? `<script>${js}<\/script>` : ''}</body></html>`);
  doc.close();
  ph.style.display = 'none';
  frame.style.display = 'block';
}

document.getElementById('canvas-connect-btn')?.addEventListener('click', canConnect);

// ── Tools ────────────────────────────────────
async function loadTools() {
  const wrap = document.getElementById('tools-wrap');
  wrap.innerHTML = loading('Loading tools…');
  try {
    const { data } = await api('/api/tools');
    if (!data?.length) {
      wrap.innerHTML = empty('🔧', 'No tools loaded yet');
      return;
    }

    const groups = {};
    data.forEach(t => {
      const cat = toolCat(t.name);
      (groups[cat] = groups[cat] || []).push(t);
    });

    wrap.innerHTML = Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([cat, tools]) => `
        <div class="section">
          <div class="sec-title">
            <span>${esc(cat)}</span>
            <span style="font-weight:400;opacity:.6">(${tools.length})</span>
          </div>
          <div class="tools-grid">
            ${tools.map(t => `
              <div class="tool-card" title="${esc(t.description || '')}">
                <div class="tool-name">${esc(t.name)}</div>
                <div class="tool-desc">${esc(t.description || 'No description')}</div>
              </div>`).join('')}
          </div>
        </div>`).join('');

    const count = document.getElementById('tools-count');
    if (count) count.textContent = `${data.length} tools`;
  } catch (e) {
    wrap.innerHTML = empty('❌', 'Failed to load tools');
    console.error('Tools load error:', e);
  }
}

function toolCat(name) {
  if (/voice|tts|speak|listen|talk|wake|audio/.test(name)) return '🎤 Voice & Audio';
  if (/memory|fact|entity|graph|recall|save/.test(name)) return '🧠 Memory & Knowledge';
  if (/file|shell|datetime|attachment/.test(name)) return '⚙️ System';
  if (/browser|screenshot|click|navigate|page/.test(name)) return '🌐 Browser Automation';
  if (/telegram|whatsapp|send|communicate/.test(name)) return '💬 Communication';
  if (/schedule|cron|task/.test(name)) return '⏰ Scheduler';
  if (/webhook/.test(name)) return '🔗 Webhooks';
  if (/mcp/.test(name)) return '🔌 MCP';
  if (/skill/.test(name)) return '💡 Skills';
  if (/agent|spawn|swarm|workflow|aggregate/.test(name)) return '🐝 Agent Orchestration';
  if (/dashboard|canvas/.test(name)) return '🎨 UI & Canvas';
  if (/heartbeat/.test(name)) return '💓 Heartbeat';
  if (/search/.test(name)) return '🔍 Search';
  if (/admin|permission/.test(name)) return '🔐 Admin';
  return '🔹 General';
}

// ── Helpers ──────────────────────────────────
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function set(id, val) {
  const el = document.getElementById(id);
  if (el) {
    if (typeof val === 'number') el.textContent = val.toLocaleString();
    else el.textContent = val ?? '—';
  }
}

function setText(id, v) {
  set(id, v);
}

function setDot(id, cls) {
  const el = document.getElementById(id);
  if (el) el.className = 'dot' + (cls ? ` ${cls}` : '');
}

function fmtDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// moved to top
window.fmtUptime = fmtUptime;

async function api(url) {
  try {
    const r = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  } catch (e) {
    console.error(`API error (${url}):`, e);
    throw e;
  }
}

function loading(msg = '') {
  return `<div class="empty"><div class="spin"></div>${msg ? `<p>${msg}</p>` : ''}</div>`;
}

function empty(ico, msg) {
  return `<div class="empty"><div class="ico">${ico}</div><p>${msg}</p></div>`;
}

// ── Toast ────────────────────────────────────
function toast(msg, type = 'info') {
  const box = document.getElementById('toasts') || createToastContainer();
  const el = document.createElement('div');
  el.className = `toast toast-${type === 'ok' ? 'ok' : type === 'err' ? 'err' : 'info'}`;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function createToastContainer() {
  const box = document.createElement('div');
  box.id = 'toasts';
  document.body.appendChild(box);
  return box;
}

window.toast = toast;

// ── Boot ─────────────────────────────────────
wsConnect();
loadHealth();
navigate('overview');

// Global intervals
setInterval(loadHealth, 30000);

// Auto-refresh the currently active page data
setInterval(() => {
  if (currentPage === 'overview') loadOverview();
  else if (currentPage === 'memory') loadMemory();
  else if (currentPage === 'scheduler') loadScheduler();
  else if (currentPage === 'webhooks') loadWebhooks();
  else if (currentPage === 'heartbeats') loadHeartbeats();
  else if (currentPage === 'sessions') loadSessions();
  else if (currentPage === 'swarms') loadSwarms();
  else if (currentPage === 'workflows') loadWorkflows();
  else if (currentPage === 'usage') loadUsage();
  // tools and admin usually don't need rapid background polling
}, 10000); // 10 seconds for snappy UI updates

// ── Voice Mode ───────────────────────────────
// Injects a microphone button into the chat footer and handles:
//  1. Web Audio MediaRecorder → webm blob
//  2. POST /api/voice/transcribe → text
//  3. Send text to AI via WebSocket
//  4. Receive AI text reply → POST /api/voice/speak → play audio

(function initVoiceMode() {
  const chatForm = document.getElementById('chat-form');
  if (!chatForm) return;

  // Add microphone button next to the send button
  const micBtn = document.createElement('button');
  micBtn.type = 'button';
  micBtn.id = 'voice-mic-btn';
  micBtn.title = 'Click to speak';
  micBtn.innerHTML = '🎙️';
  micBtn.style.cssText = `
    background: var(--card, #1e293b);
    border: 1.5px solid var(--border, #334155);
    border-radius: 50%;
    width: 42px;
    height: 42px;
    font-size: 18px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    flex-shrink: 0;
  `;

  // Insert before the send button
  const sendBtn = document.getElementById('chat-send');
  if (sendBtn) {
    chatForm.insertBefore(micBtn, sendBtn);
  } else {
    chatForm.appendChild(micBtn);
  }

  let mediaRecorder = null;
  let audioChunks = [];
  let isRecording = false;
  let voiceTTSEnabled = true; // Can be toggled

  // Add a CSS pulse animation for the recording state
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    #voice-mic-btn.recording {
      background: #ef4444 !important;
      border-color: #ef4444 !important;
      animation: micPulse 1s ease-in-out infinite;
    }
    @keyframes micPulse {
      0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
      50% { transform: scale(1.08); box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); }
    }
    #voice-tts-indicator {
      font-size: 11px;
      color: var(--muted, #94a3b8);
      text-align: center;
      padding: 2px 0;
    }
  `;
  document.head.appendChild(styleEl);

  micBtn.addEventListener('mouseenter', () => {
    if (!isRecording) micBtn.style.background = 'var(--accent, #6366f1)';
  });
  micBtn.addEventListener('mouseleave', () => {
    if (!isRecording) micBtn.style.background = 'var(--card, #1e293b)';
  });

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      isRecording = true;
      audioChunks = [];
      micBtn.classList.add('recording');
      micBtn.title = 'Recording… click to stop';
      toast('🎙️ Recording…', 'info');

      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        await processAudio();
      };
      mediaRecorder.start(250);
    } catch (err) {
      toast('Microphone access denied', 'err');
      console.error('Voice: could not get microphone', err);
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    isRecording = false;
    micBtn.classList.remove('recording');
    micBtn.style.background = 'var(--card, #1e293b)';
    micBtn.title = 'Click to speak';
    toast('⏳ Transcribing…', 'info');
  }

  async function processAudio() {
    try {
      const blob = new Blob(audioChunks, { type: 'audio/webm' });
      if (blob.size < 1000) {
        toast('Recording too short', 'err');
        return;
      }

      const formData = new FormData();
      formData.append('audio', blob, 'voice.webm');

      const resp = await fetch('/api/voice/transcribe', { method: 'POST', body: formData });
      const data = await resp.json();

      if (!data.success || !data.text) {
        toast('Transcription failed: ' + (data.error || 'unknown'), 'err');
        return;
      }

      const transcript = data.text.trim();
      toast(`📝 "${transcript.substring(0, 50)}${transcript.length > 50 ? '…' : ''}"`, 'ok');

      // Set in chat box and submit
      const chatTa = document.getElementById('chat-ta');
      if (chatTa) {
        chatTa.value = transcript;
        chatForm.requestSubmit();
      }
    } catch (err) {
      toast('Voice error: ' + err.message, 'err');
      console.error('Voice process error:', err);
    }
  }

  micBtn.addEventListener('click', () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  });

  // Auto-speak AI replies via TTS
  const originalAppendMsg = window.appendMsg || appendMsg;
  window.appendMsg = function voiceAppendMsg(role, text) {
    originalAppendMsg(role, text);
    if (role === 'bot' && voiceTTSEnabled && text.length > 0) {
      speakText(text);
    }
  };

  async function speakText(text) {
    try {
      const resp = await fetch('/api/voice/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.substring(0, 1000), voice: 'nova' }),
      });
      if (!resp.ok) return; // Gracefully skip TTS if not configured
      const audioBlob = await resp.blob();
      const url = URL.createObjectURL(audioBlob);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      audio.play().catch(() => { }); // Ignore autoplay policy errors
    } catch {
      // TTS is best-effort, never block the UI
    }
  }

  // Long-press on mic button toggles TTS on/off
  let holdTimer;
  micBtn.addEventListener('mousedown', () => {
    holdTimer = setTimeout(() => {
      voiceTTSEnabled = !voiceTTSEnabled;
      toast(voiceTTSEnabled ? '🔊 Voice replies ON' : '🔇 Voice replies OFF', 'info');
    }, 800);
  });
  micBtn.addEventListener('mouseup', () => clearTimeout(holdTimer));
  micBtn.addEventListener('mouseleave', () => clearTimeout(holdTimer));
})();

