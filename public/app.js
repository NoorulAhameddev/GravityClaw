// ─────────────────────────────────────────────
//  Gravity Claw  — Web UI App — Enhanced
// ─────────────────────────────────────────────

// ── Router ──────────────────────────────────
const PAGES = ['chat', 'dashboard', 'memory', 'canvas', 'tools'];
let currentPage = 'chat';

function navigate(page) {
  if (!PAGES.includes(page)) return;
  if (currentPage === page) return;
  
  currentPage = page;
  PAGES.forEach(p => {
    const el = document.getElementById(`page-${p}`);
    const nav = document.querySelector(`[data-page="${p}"]`);
    if (el) el.classList.toggle('active', p === page);
    if (nav) nav.classList.toggle('active', p === page);
  });

  // Page-specific actions
  if (page === 'dashboard') loadDashboard();
  if (page === 'memory') loadMemory();
  if (page === 'tools') loadTools();
  
  document.title = `Gravity Claw — ${page.charAt(0).toUpperCase() + page.slice(1)}`;
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
    setDot('ws-dot', 'ok');
    setText('ws-status', 'Connected');
    document.getElementById('send-btn').disabled = false;
    toast('Connected to server', 'ok');
  };

  ws.onmessage = ({ data }) => {
    try {
      const m = JSON.parse(data);
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
  };

  ws.onclose = () => {
    setDot('ws-dot', '');
    setText('ws-status', 'Disconnected');
    document.getElementById('send-btn').disabled = true;
    wsTimer = setTimeout(() => {
      wsDelay = Math.min(wsDelay * 1.5, WS_MAX_DELAY);
      wsConnect();
    }, wsDelay);
  };

  ws.onerror = (e) => {
    setDot('ws-dot', 'warn');
    setText('ws-status', 'Error');
    console.error('WebSocket error:', e);
  };
}

// ── Chat ─────────────────────────────────────
function appendMsg(role, text) {
  const wrap = document.getElementById('chat-msgs');
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
  const el = document.getElementById('typing-row');
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
    document.getElementById('chat-msgs').innerHTML = '';
    showTyping(false);
    toast('Chat cleared', 'info');
  }
});

// ── Dashboard ────────────────────────────────
async function loadDashboard() {
  try {
    const [health, toolsRes, memRes] = await Promise.all([
      api('/api/health'),
      api('/api/tools').catch(() => ({ count: 0 })),
      api('/api/memory').catch(() => ({ data: [] })),
    ]);

    set('s-status', health.status === 'ok' ? '✓ Online' : '✗ Down');
    set('s-uptime', fmtUptime(health.uptime));
    set('s-port', health.server?.port ?? '—');
    set('s-wsc', health.server?.wsClients ?? 0);
    set('s-tools', toolsRes.count ?? '—');
    set('s-sessions', memRes.data?.length ?? 0);
    set('s-ts', new Date(health.timestamp).toLocaleString());

    const usage = await api('/api/usage').catch(() => null);
    if (usage?.success) renderUsage(usage.data);
  } catch (err) {
    console.error('Dashboard error:', err);
    toast('Failed to load dashboard', 'err');
  }
}

function fmtUptime(s) {
  if (s == null) return '—';
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    sec = Math.floor(s % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function renderUsage(data) {
  const el = document.getElementById('usage-section');
  if (!el || !data) return;
  const today = data.byPeriod?.today || {};
  const week = data.byPeriod?.week || {};
  const all = data.byPeriod?.allTime || {};

  let modelsHtml = '';
  if (data.models?.length) {
    modelsHtml = `
      <div class="section" style="margin-top:20px">
        <div class="sec-title">By Model (All Time)</div>
        <table class="tbl" style="background:var(--card);border-radius:8px;overflow:hidden">
          <thead><tr><th>Model</th><th>Calls</th><th>Tokens</th><th>Cost</th></tr></thead>
          <tbody>
            ${data.models.map(m => `
              <tr>
                <td style="font-family:monospace;font-size:12px"><strong>${esc(m.model)}</strong></td>
                <td><strong>${m.calls}</strong></td>
                <td>${(m.tokens || 0).toLocaleString()}</td>
                <td><strong>$${(m.cost || 0).toFixed(5)}</strong></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  el.innerHTML = `
    <div class="sec-title" style="margin-top:20px">📊 Token Usage</div>
    <div class="stat-grid">
      <div class="stat blue">
        <div class="stat-lbl">Today · Requests</div>
        <div class="stat-val">${today.requests ?? 0}</div>
        <div class="stat-sub">${(today.tokens || 0).toLocaleString()} tokens</div>
      </div>
      <div class="stat green">
        <div class="stat-lbl">Today · Cost</div>
        <div class="stat-val">$${(today.cost || 0).toFixed(4)}</div>
      </div>
      <div class="stat blue">
        <div class="stat-lbl">This Week · Requests</div>
        <div class="stat-val">${week.requests ?? 0}</div>
        <div class="stat-sub">${(week.tokens || 0).toLocaleString()} tokens</div>
      </div>
      <div class="stat yellow">
        <div class="stat-lbl">All Time · Cost</div>
        <div class="stat-val">$${(all.cost || 0).toFixed(4)}</div>
        <div class="stat-sub">${(all.requests || 0)} total calls</div>
      </div>
    </div>
    ${modelsHtml}`;
}

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
  let sid = document.getElementById('can-sid').value.trim();
  if (!sid) { sid = `web-${Date.now()}`; document.getElementById('can-sid').value = sid; }

  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  canWs = new WebSocket(`${proto}//${location.host}/canvas?session=${sid}`);

  canWs.onopen = () => { setDot('can-dot', 'ok'); setText('can-status', 'Connected'); };
  canWs.onclose = () => { setDot('can-dot', ''); setText('can-status', 'Disconnected'); };
  canWs.onerror = () => { setDot('can-dot', 'warn'); setText('can-status', 'Error'); };
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

document.getElementById('can-connect')?.addEventListener('click', canConnect);

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
  if (el) el.textContent = val;
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
navigate('chat');

// Auto-reload dashboard every 30 seconds
setInterval(() => {
  if (currentPage === 'dashboard') {
    loadDashboard().catch(e => console.log('Auto-refresh failed:', e));
  }
}, 30000);
