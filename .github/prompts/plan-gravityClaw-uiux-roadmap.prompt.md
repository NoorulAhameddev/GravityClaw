## Plan: Gravity Claw UI/UX Enhancement Roadmap

### TL;DR
Transform Gravity Claw from backend-heavy (95% complete) to full-featured (90%+ completion) by systematically implementing missing UI layers: settings dashboard, analytics dashboard, admin panel, and materializing placeholder sections. Phased approach: **Phase 1 (Foundations)** builds reusable dashboard components; **Phase 2 (Core Dashboards)** delivers analytics and settings; **Phase 3 (Advanced Features)** completes admin tools and real plugin/memory sections. Decision: Continue vanilla JS/CSS (no framework) for consistency, use component library pattern from existing code, leverage backend tools that already exist.

---

## Phase 1: Foundation & Component Library (Weeks 1-2)

### Step 1.1: Create Dashboard Container Layout
**Goal:** Establish reusable dashboard page template that all new pages will inherit from.

**Files to create:**
- `public/dashboards.html` — Master layout with sidebar nav, breadcrumbs, main content area
- `public/dashboards.css` — Dashboard-specific grid layout (header, sidebar, content, footer)
- `public/dashboard-common.js` — Shared logic (nav highlighting, page switching, state mgmt)

**Key patterns from existing code:**
- Reuse `.sidebar` structure from `public/index.html`
- Leverage CSS variables from `public/style.css`
- Follow WebSocket connection pattern from `public/app.js`

**What it contains:**
- Left nav with tabs (Chat, Settings, Analytics, Admin, Plugins, Memory)
- Breadcrumb trail (e.g., "Settings > Voice")
- Hero header with page title/description
- Content grid area (main work surface)
- Footer with version + status

### Step 1.2: Build Reusable Component Kit
**Goal:** Before building dashboards, establish atomic UI components.

**Files to create:**
- `public/components/card.js` — Card container (title, footer, actions)
- `public/components/stat-block.js` — Metric display (label, value, sparkline)
- `public/components/toggle.js` — Switch component for boolean settings
- `public/components/dropdown.js` — Select component for options
- `public/components/modal.js` — Confirm dialogs, settings panels
- `public/components/badge.js` — Role/status badges

**Implementation style:**
- Follow function-based component pattern (not React, pure functions)
- Each component returns HTML string + event handlers
- Leverage event delegation from `public/app.js` pattern

**Example pattern:**
```javascript
// From public/app.js pattern - extend this for components
function createCard(title, content, actions = []) {
    const card = document.createElement('div');
    card.className = 'dashboard-card';
    card.innerHTML = `
        <div class="card-header">
            <h3>${title}</h3>
        </div>
        <div class="card-body">${content}</div>
        <div class="card-footer">${actions.map(a => `<button>${a.label}</button>`).join('')}</div>
    `;
    return card;
}
```

### Step 1.3: Dashboard Navigation System
**Goal:** Route between Chat, Settings, Analytics, Admin, Plugins, Memory pages.

**Implement in:**
- `public/dashboard-common.js` — Add page router logic
- `public/dashboards.html` — Add nav button handlers
- `public/dashboards.css` — Page transition animations

**Decision:** Keep chat and dashboards separate entry points (index.html vs dashboards.html) to avoid bloating single file. Use URL hash (`#/settings`, `#/analytics`) for routing within dashboards.

---

## Phase 2: Core Dashboards (Weeks 3-5)

### Step 2.1: Settings Dashboard
**Goal:** Surface backend voice/notification settings to the UI.

**Create:**
- `public/pages/settings.html` (content template)
- `public/pages/settings.js` (logic)
- `public/pages/settings.css` (styling)

**Sections to implement:**
1. **Voice Settings** — Expose tools from `src/tools/voice-settings.ts`
   - Mode selector (off / transcribe-only / full-voice)
   - TTS provider dropdown (OpenAI / ElevenLabs)
   - Voice speed slider
   - Sample playback buttons

2. **Notification Settings** — Add new controls
   - Toast notification toggles (success/warning/error)
   - Desktop notification opt-in
   - Notification frequency (real-time / hourly digest)

3. **Display Settings** — UI-only
   - Theme toggle (skeleton for now — prepare CSS vars for light mode later)
   - Font size selector
   - Sidebar collapse preference
   - Compact/spacious layout mode

4. **Account Settings** — Add new capability
   - Session ID display
   - Connected devices list (from `bailey_auth_info/device-list-*.json`)
   - Session timeout
   - Account deletion warning (placeholder)

**Backend integration:**
- Call `setVoiceSettings` tool via WebSocket (pattern from `public/app.js`)
- Call new `setNotificationPreferences` tool (needs implementation in backend)
- Read settings via new `getSettings` tool

### Step 2.2: Analytics Dashboard
**Goal:** Visualize token usage, costs, and session stats from backend.

**Create:**
- `public/pages/analytics.html`
- `public/pages/analytics.js`
- `public/pages/analytics.css`
- `public/components/chart.js` — Lightweight charting (CSS bars or SVG)

**Sections to implement:**
1. **Usage Overview** (Top cards)
   - Total tokens this session
   - Total cost (USD)
   - Average latency
   - API calls count

2. **Model Breakdown** (Grid of stat blocks)
   - OpenAI: tokens + cost
   - Anthropic: tokens + cost
   - Google: tokens + cost
   - Groq: tokens + cost

3. **Time Series Chart** (Last 24 hours)
   - Token usage by hour (bar chart)
   - Cost trend (line chart)
   - Model distribution (stacked bars)

4. **Recent API Calls** (Table/list)
   - Timestamp
   - Model used
   - Tokens (prompt/completion)
   - Cost
   - Latency
   - Provider

**Backend integration:**
- Call `getUsageStats` from `src/usage.ts`
- New tool: `getUsageHistory(sessionId, since, limit)` returns array of UsageRecord
- New tool: `getModelBreakdown(sessionId)` aggregates by model

**Charting approach:**
- Use CSS bar charts (simple `div` with calculated widths)
- Use HTML canvas for line charts if needed (lightweight library or custom)
- Fallback: ASCII-style text representation

### Step 2.3: Session Info & Connection Status Panel
**Goal:** Display current session, device, connected channels.

**Add to:**
- `public/pages/settings.html` (new "Session" section)
- New tool in backend: `getSessionInfo()` returns { sessionId, userId, channels, devices, connectedAt, uptime }

**Display:**
- Current session ID (copyable)
- Connected channels (Telegram ✓, WhatsApp ✓, Mobile ✗, WebChat ✓)
- Connected devices (mobile devices from `src/gateway/mobile.ts`)
- Agent status (thinking / idle)
- Session uptime
- "Disconnect all" button (dangerous, warn user)

---

## Phase 3: Admin & Advanced Features (Weeks 6-8)

### Step 3.1: Admin Panel (Group Management)
**Goal:** Surface group controls for Telegram/WhatsApp admin operations.

**Create:**
- `public/pages/admin.html`
- `public/pages/admin.js`
- `public/pages/admin.css`

**Sections:**
1. **Group Overview** (For groups the user is admin in)
   - List all groups (platform, group ID, member count, added admins)
   - Show current user's role (owner/admin/member)

2. **Group Settings** (Per-group panel)
   - Toggle dangerous tools (run_shell, file ops) with warnings
   - Manage admins (add/remove from `src/groups/index.ts`)
   - View tool usage by user
   - Set rate limits (if available)

3. **User Permissions Matrix** (Table)
   - Columns: Username, Tools Allowed, Last Used, Actions
   - Filter by tool, user, or date

**Backend integration:**
- Expose `addGroupAdmin`, `removeGroupAdmin`, `getGroupSettings` as tools
- New tool: `listGroupsForUser()` — return groups where user is admin
- New tool: `updateGroupToolPermissions(groupId, toolName, enabled)`

### Step 3.2: MCP Plugins Page (Functional)
**Goal:** Replace placeholder with actual plugin management.

**Create:**
- `public/pages/plugins.html`
- `public/pages/plugins.js`
- `public/pages/plugins.css`

**Sections:**
1. **Installed Plugins** (List)
   - Plugin name, version, description
   - Status (loaded, error, disabled)
   - Actions: disable, remove, reload, configure

2. **Available Plugins** (Market view)
   - Search marketplace
   - Install new plugins
   - Filter by category (browser, file, shell, voice, etc.)

3. **Plugin Details** (Modal)
   - Permissions requested (tools, file paths)
   - Configuration options
   - Recent errors/logs
   - Restart button

**Backend integration:**
- Use existing `src/plugins/registry.ts` endpoints
- New tools: `listPlugins()`, `getPluginDetails(pluginId)`, `togglePlugin(pluginId)`, `configurePlugin(pluginId, config)`
- Read mcp-servers.json schema for available servers

### Step 3.3: Memory Vault Page (Functional)
**Goal:** Visualize saved entities, facts, and relationships.

**Create:**
- `public/pages/memory.html`
- `public/pages/memory.js`
- `public/pages/memory.css`

**Sections:**
1. **Facts** (Searchable table)
   - Fact ID, content, created_at, last_accessed, relevance score
   - Edit/delete buttons
   - Filter by date, relevance

2. **Entities** (Graph preview)
   - Node list (name, type, properties)
   - Connected relationships
   - Visualization using D3.js or custom SVG

3. **Relationships** (Table)
   - From entity → relation type → To entity
   - Edit/delete buttons
   - Filter by type

**Backend integration:**
- Expose existing memory tools as retrievers:
  - New tool: `listFacts(limit, offset)` from SQLite facts table
  - New tool: `listEntities(limit, offset)` from SQLite entities table
  - New tool: `listRelationships(limit, offset)` from relationship graph
  - New tool: `searchMemory(query)` — semantic search via recall tool

---

## Phase 4: Polish & Refinements (Weeks 9-10)

### Step 4.1: Light Theme & Theme Toggle
**Goal:** Add light mode to match dark, with smooth switching.

**Implement in:**
- `public/style.css` — Add `@media (prefers-color-scheme: light)` overrides
- `public/dashboards.css` — Same light theme
- `public/dashboard-common.js` — Add theme toggle logic
- Store preference in `localStorage`

**Light theme colors:**
- Background: #f9fafb
- Text primary: #111827
- Text secondary: #6b7280
- Accent: #6366f1 (unchanged)
- Cards: #ffffff with subtle shadow

### Step 4.2: Error Boundary & Validation
**Goal:** Handle missing backend tools gracefully.

**Implement in:**
- `public/dashboard-common.js` — Wrap tool calls in try-catch
- Each dashboard — Show "Feature unavailable" if backend tool missing
- Console logging for debugging

**Pattern:**
```javascript
async function callTool(toolName, args) {
    try {
        ws.send(JSON.stringify({ type: 'message', text: `/${toolName} ${JSON.stringify(args)}` }));
        // await response...
    } catch (err) {
        showToast(`${toolName} not available: ${err.message}`, 'warning');
    }
}
```

### Step 4.3: Keyboard Shortcuts Help
**Goal:** Document and implement Cmd+K command palette + global shortcuts.

**Create:**
- `public/components/shortcuts-modal.js`
- Update `public/dashboard-common.js` to listen for Cmd+K / Ctrl+K

**Shortcuts:**
- `Cmd+K` — Open command palette (search pages, tools)
- `Cmd+,` — Open settings
- `Cmd+/` — Show help
- `Cmd+Shift+A` — Open analytics
- `Shift+Enter` — New line in chat
- `Escape` — Close modals

### Step 4.4: Mobile Dashboard Responsiveness
**Goal:** Ensure all dashboards work on mobile (480px breakpoint).

**Update:**
- All new dashboard CSS files with mobile-specific rules
- Hide chart details on mobile, show key metrics only
- Stack tables vertically as cards
- Use collapsible sections for complex lists

---

## Phase 5: Backend Tool Implementation (Concurrent)

While UI is being built, backend tools need to be created/exposed:

### New Tools Needed:

| Tool Name | File Impact | Purpose |
|-----------|-------------|---------|
| `setNotificationPreferences` | `src/tools/notifications.ts` (new) | Save user notification settings |
| `getUsageHistory` | `src/usage.ts` | Return time-series usage data |
| `getModelBreakdown` | `src/usage.ts` | Aggregate costs by model |
| `getSessionInfo` | `src/index.ts` (extend) | Return current session details |
| `listGroupsForUser` | `src/groups/index.ts` | Query admin groups |
| `updateGroupToolPermissions` | `src/groups/index.ts` | Set tool access per group |
| `listPlugins` | `src/plugins/registry.ts` | Get installed/available plugins |
| `listFacts` | `src/memory/facts.ts` (new) | Paginated facts retrieval |
| `listEntities` | `src/memory/entities.ts` | List knowledge graph nodes |
| `listRelationships` | `src/memory/entities.ts` | List graph edges |
| `searchMemory` | `src/memory/search.ts` | Semantic search across all memory |

---

## Implementation Timeline & Milestones

```
WEEK 1-2: Phase 1 (Foundations)
├─ Dashboard container layout + navigation
├─ Component library (card, stat-block, toggle, etc.)
├─ CSS variables for dashboard pages
└─ Testing: Navigation between dummy pages

WEEK 3-5: Phase 2 (Core Dashboards)
├─ Settings page (voice, notification, display, account)
├─ Analytics dashboard (stats, charts, table)
├─ Session info panel
├─ Deploy corresponding backend tools
└─ Testing: Full end-to-end for settings & analytics

WEEK 6-8: Phase 3 (Admin & Advanced)
├─ Admin panel (group management)
├─ MCP Plugins page (functional)
├─ Memory Vault page (entities, facts, relationships)
├─ Deploy backend tools for plugins & memory
└─ Testing: Group operations, plugin loading, memory search

WEEK 9-10: Phase 4 (Polish)
├─ Light theme + toggle
├─ Error boundaries
├─ Keyboard shortcuts & command palette
├─ Mobile responsiveness refinement
├─ Performance optimization
└─ Final UAT (user acceptance testing)

CONCURRENT: Phase 5 (Backend Tools)
├─ Implement missing tools weekly
├─ Add to tool registry
├─ Write tests for each tool
└─ Ensure WebSocket delivery of results
```

---

## File Structure After Completion

```
public/
├─ index.html                    (Chat page - unchanged)
├─ app.js                        (Chat logic - minor extensions for WebSocket)
├─ style.css                     (Chat styles - unchanged)
├─
├─ dashboards.html               (NEW: Dashboard master layout)
├─ dashboards.css                (NEW: Dashboard grid & shared styles)
├─ dashboard-common.js           (NEW: Navigation, routing, shared logic)
├─
├─ pages/
│  ├─ settings.html              (NEW)
│  ├─ settings.js                (NEW)
│  ├─ settings.css               (NEW)
│  ├─
│  ├─ analytics.html             (NEW)
│  ├─ analytics.js               (NEW)
│  ├─ analytics.css              (NEW)
│  ├─
│  ├─ admin.html                 (NEW)
│  ├─ admin.js                   (NEW)
│  ├─ admin.css                  (NEW)
│  ├─
│  ├─ plugins.html               (NEW)
│  ├─ plugins.js                 (NEW)
│  ├─ plugins.css                (NEW)
│  ├─
│  └─ memory.html                (NEW)
│     ├─ memory.js               (NEW)
│     └─ memory.css              (NEW)
│
└─ components/
   ├─ card.js                    (NEW)
   ├─ stat-block.js              (NEW)
   ├─ toggle.js                  (NEW)
   ├─ dropdown.js                (NEW)
   ├─ modal.js                   (NEW)
   ├─ badge.js                   (NEW)
   ├─ chart.js                   (NEW)
   └─ shortcuts-modal.js         (NEW)
```

---

## Key Decisions Made

1. **No framework** — Continue vanilla JS/CSS for consistency with existing codebase
2. **Separate HTML file** — `dashboards.html` for dashboards keeps main chat (`index.html`) lean
3. **URL hash routing** — Use `#/settings`, `#/analytics` for SPA-like navigation
4. **Component functions** — Function-based components returning HTML + handlers (not class-based)
5. **WebSocket for tools** — All dashboard interactions call backend tools via existing WebSocket
6. **CSS variables for theming** — Prepare for light/dark toggle using CSS custom properties
7. **Incremental rollout** — Each phase is independently deployable and testable
8. **Backward compatibility** — Chat page remains unchanged; dashboards are additive

---

## Success Criteria

- ✅ All 5 dashboard pages functional (Settings, Analytics, Admin, Plugins, Memory)
- ✅ Voice settings, notifications, session info exposed in UI
- ✅ Usage stats visible with charts/metrics
- ✅ Admin can manage group tool permissions
- ✅ Plugin list shows installed/available plugins
- ✅ Memory vault displays facts, entities, relationships
- ✅ Mobile responsive at 480px, 768px, 1024px breakpoints
- ✅ Light theme toggle working
- ✅ Zero console errors during navigation
- ✅ All backend tools returning data correctly
- ✅ Load time < 2s for dashboard pages (excluding data fetch)

---

## Risks & Mitigation

| Risk | Mitigation |
|------|-----------|
| Backend tools not ready in time | Implement frontend skeletons first, use mock data for demo |
| Performance on large memory datasets | Implement pagination + lazy loading in lists |
| Mobile layout breaking on 480px | Component library must test all breakpoints early |
| Dark-to-light theme flicker | Use `prefers-color-scheme` + localStorage + CSS-in-head |
| WebSocket timeout on slow connections | Add timeout + retry logic in dashboard-common.js |

---

## Questions for Refinement

1. **Phasing preference** — Complete all of Phase 1 before Phase 2, or work in parallel?
2. **Priority reordering** — Prioritize Analytics before Settings, or vice versa?
3. **Chart library** — Lightweight CSS bars, SVG, or add Chart.js?
4. **Backend timeline** — Implement tools concurrently or sequentially?
5. **Team size** — Solo project or multiple people on different phases?
6. **Scope adjustments** — Drop any features, or add others?
7. **Visual reference** — Style dashboards after Linear, Vercel, OpenAI, or custom design?
