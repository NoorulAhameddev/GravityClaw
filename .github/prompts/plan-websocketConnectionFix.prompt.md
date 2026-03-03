# COMPREHENSIVE WEBSOCKET CONNECTION FIX PLAN

## **Executive Summary**

The dashboard UI loads correctly, but WebSocket connections aren't establishing between browser and server. The root causes are:
1. **Silent error handling** - Channel startup errors are logged but not surfaced
2. **No verification** - Server startup isn't verified before main() continues
3. **Architectural confusion** - Duplicate WebSocket handlers in different files
4. **Missing error boundaries** - No way to detect port binding or startup failures

---

## **PHASE 1: DIAGNOSE THE EXACT PROBLEM**

### **Step 1.1: Check Server Logs**

**Objective:** Determine if the server is actually starting and listening

**Actions:**
- [ ] Start the server: `npm start`
- [ ] Look for patterns in logs:
  - ✅ "🚀 Web server listening on http://localhost:3000" = Server IS listening
  - ❌ "Failed to start channel webchat" = Channel startup failed
  - ❌ "EADDRINUSE: address already in use :::3000" = Port already in use
  - ❌ No message at all = Startup completed but no verification

**Expected outcome:** Identify if server is listening or if it's a startup failure

---

### **Step 1.2: Check Browser Console**

**Objective:** See what the browser is trying to do

**Actions:**
- [ ] Open dashboard in browser: `http://localhost:3000/dashboards.html`
- [ ] Press F12 → Console tab
- [ ] Look for messages:
  - ✅ "🔗 Connecting to ws://localhost:3000/..." = Attempting connection
  - ✅ "✅ WebSocket connected" = Connection succeeded
  - ❌ "WebSocket error:" = Connection failed (check error details)
  - ❌ No WebSocket message = connection.js didn't run

**Expected outcome:** See exact WebSocket behavior and error messages

---

### **Step 1.3: Network Tab Analysis**

**Objective:** See if WebSocket upgrade request is being sent

**Actions:**
- [ ] Open browser DevTools → Network tab → WS filter
- [ ] Refresh page
- [ ] Look for WebSocket request to `ws://localhost:3000/`
  - ✅ Request listed with status "101 Switching Protocols" = Success
  - ❌ Request listed with status "404" = Server not handling the path
  - ❌ No request listed = Browser not attempting connection
  - ❌ Pending/red X = Connection attempt that server rejected

**Expected outcome:** Know if the browser is successfully initiating the WebSocket handshake

---

## **PHASE 2: ADD DIAGNOSTIC LOGGING**

### **Step 2.1: Add Server Startup Verification**

**File:** `src/server.ts`

**Change:** Add error handling and logging to server startup

```typescript
// BEFORE (line 145-151):
export function startServer(): Promise<void> {
  return new Promise((resolve) => {
    const port = config.PORT || 3000;
    server.listen(port, () => {
      log.info(`🚀 Web server listening on http://localhost:${port}`);
      resolve();
    });
  });
}

// AFTER: Add error handler
export function startServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const port = config.PORT || 3000;
    
    server.listen(port, () => {
      log.info(`🚀 Web server listening on http://localhost:${port}`);
      resolve();
    });

    // ADD THESE ERROR HANDLERS
    server.on("error", (err: any) => {
      if (err.code === "EADDRINUSE") {
        log.error(`❌ Port ${port} is already in use. Kill existing process or use different port.`);
      } else {
        log.error(`❌ Server error: ${err.message}`);
      }
      reject(err);
    });
  });
}
```

**Why:** Server startup errors will now be thrown instead of silently ignored.

---

### **Step 2.2: Add Channel Startup Error Reporting**

**File:** `src/channels/router.ts`

**Change:** Make startup failures fatal

```typescript
// BEFORE (line 36-47):
async startAll() {
    for (const channel of this.channels.values()) {
        try {
            await channel.start(this.handleMessage.bind(this));
        } catch (err) {
            log.error(`Failed to start channel ${channel.id}`, err);
        }
    }
}

// AFTER: Throw errors instead of silently catching
async startAll() {
    for (const channel of this.channels.values()) {
        try {
            log.info(`Starting channel: ${channel.id}...`);
            await channel.start(this.handleMessage.bind(this));
            log.info(`✅ Channel started: ${channel.id}`);
        } catch (err) {
            log.error(`❌ FATAL: Failed to start channel ${channel.id}`, err);
            throw err; // ADDED: Re-throw so caller knows startup failed
        }
    }
}
```

**Why:** Any channel failure will now crash the server with a clear error message.

---

### **Step 2.3: Add WebChat Connection Logging**

**File:** `src/channels/webchat.ts`

**Change:** Log when connections are received and handled

```typescript
// In WebChatChannel.start() method, after line 45:
wss.on("connection", (ws) => {
    log.info("📡 New WebSocket client connected");  // ADD THIS
    this.clients.add(ws);

    ws.on("message", async (data) => {
        try {
            const parsed: WebChatMessage = JSON.parse(data.toString());
            
            if (parsed.type === "message" && parsed.text && this.onMessageCb) {
                log.debug(`📨 Received message: ${parsed.text.substring(0, 50)}...`);  // ADD THIS
                const unifiedMsg: UnifiedMessage = {
                    // ... existing code ...
                };
                await this.onMessageCb(unifiedMsg);
            } else if ((parsed as any).type === "tool_call") {
                log.info(`🔧 Tool call received: ${(parsed as any).tool}`);  // ADD THIS
                const { id, tool: toolName, args } = parsed as any;
                const { registry } = await import("../tools/index.ts");

                const tool = registry.get(toolName);
                if (!tool) {
                    log.warn(`❌ Tool not found: ${toolName}`);  // ADD THIS
                    // ... rest of code ...
                }
            }
        } catch (err) {
            log.error("Failed to parse WebChat message", err);  // IMPROVED
        }
    });

    ws.on("close", () => {
        log.info("📡 WebSocket client disconnected");  // ADD THIS
        this.clients.delete(ws);
    });

    ws.on("error", (err) => {
        log.error("WebSocket client error", err);  // ADD THIS
    });
});
```

**Why:** You'll see exactly when clients connect/disconnect and what messages they send.

---

### **Step 2.4: Add Browser Console Debugging**

**File:** `public/dashboard-common.js`

**Change:** Enhanced logging in WebSocket connection

```javascript
// Around line 272-310, ENHANCE the connectWebSocket function:
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    log(`🔗 Attempting WebSocket connection to: ${wsUrl}`);
    log(`   Protocol: ${protocol}`);
    log(`   Host: ${window.location.host}`);

    try {
        state.ws = new WebSocket(wsUrl);
        log(`✓ WebSocket object created (readyState: ${state.ws.readyState})`);

        state.ws.onopen = () => {
            log('✅ WebSocket OPEN - Connection successful!');
            log(`   ReadyState: ${state.ws.readyState}`);
            CONFIG.wsReconnectAttempts = 0;
            updateConnectionStatus(true);
            showToast('Connected to Gravity Claw', 'success');
        };

        state.ws.onclose = () => {
            log('❌ WebSocket CLOSED');
            log(`   Code: ${event.code}, Reason: ${event.reason}`);
            updateConnectionStatus(false);
            scheduleReconnect();
        };

        state.ws.onerror = (event) => {
            log(`❌ WebSocket ERROR: ${event.type}`);
            log(`   Message: ${event.message || 'No message'}`);
            logError('WebSocket Error', event);
            updateConnectionStatus(false);
        };

        state.ws.onmessage = (event) => {
            log(`📨 WebSocket message received: ${event.data.substring(0, 100)}...`);
            handleWebSocketMessage(event);
        };
    } catch (error) {
        log(`❌ Failed to create WebSocket: ${error.message}`);
        updateConnectionStatus(false);
        scheduleReconnect();
    }
}

// Add simple logger function at top of file
function log(msg) {
    const timestamp = new Date().toISOString().slice(11, 19);
    console.log(`[${timestamp}] ${msg}`);
}
```

**Why:** Browser console will show exactly what's happening at each step of connection.

---

## **PHASE 3: CONSOLIDATE WEBSOCKET HANDLERS**

### **Step 3.1: Remove Duplicate Handler in server.ts**

**File:** `src/server.ts`

**Change:** Remove the generic handler that does nothing

```typescript
// DELETE: Lines 44-70 (the entire wss.on("connection") handler)
// REASON: WebChatChannel already handles this, so this is redundant

wss.on("connection", (ws: WebSocket, req) => {
    // ... all this code is REMOVED because WebChatChannel handles it ...
});
```

**Why:** Eliminate confusion - let WebChatChannel be the single authority for handling WebSocket messages.

---

### **Step 3.2: Improve WebChat Handler**

**File:** `src/channels/webchat.ts`

**Change:** Make the handler more robust

```typescript
// In WebChatChannel.start(), around line 45:
wss.on("connection", (ws: WebSocket, req) => {
    log.info("📡 [WebChat] New WebSocket client connected");
    
    // IMPORTANT: Initialize keep-alive tracking
    (ws as any).isAlive = true;
    ws.on("pong", () => {
        (ws as any).isAlive = true;
    });

    this.clients.add(ws);

    ws.on("message", async (data) => {
        try {
            const parsed: WebChatMessage = JSON.parse(data.toString());

            if (parsed.type === "message" && parsed.text && this.onMessageCb) {
                log.debug(`[WebChat] Message from client: "${parsed.text.substring(0, 50)}..."`);
                const unifiedMsg: UnifiedMessage = {
                    channelId: this.id,
                    chatId: "webchat-session",
                    userId: "web-user",
                    text: parsed.text,
                };
                await this.onMessageCb(unifiedMsg);
            } else if ((parsed as any).type === "tool_call") {
                const { id, tool: toolName, args } = parsed as any;
                log.info(`[WebChat] Tool call: ${toolName}`);
                
                const { registry } = await import("../tools/index.ts");
                const tool = registry.get(toolName);
                
                if (!tool) {
                    log.warn(`[WebChat] ❌ Tool not found: ${toolName}`);
                    ws.send(JSON.stringify({
                        type: "tool_response",
                        id,
                        error: `Tool not found: ${toolName}`
                    }));
                    return;
                }

                try {
                    log.debug(`[WebChat] Executing tool: ${toolName}`);
                    const resultStr = await tool.execute(args || {});
                    const result = JSON.parse(resultStr);

                    log.debug(`[WebChat] Tool result: success=${result.success}`);
                    ws.send(JSON.stringify({
                        type: "tool_response",
                        id,
                        result
                    }));
                } catch (err: any) {
                    log.error(`[WebChat] ❌ Tool execution failed: ${toolName}`, err);
                    ws.send(JSON.stringify({
                        type: "tool_response",
                        id,
                        error: err.message || "Execution failed"
                    }));
                }
            }
        } catch (err) {
            log.error("[WebChat] Failed to parse message", err);
        }
    });

    ws.on("close", () => {
        log.info("[WebChat] Client disconnected");
        this.clients.delete(ws);
    });

    ws.on("error", (err) => {
        log.error("[WebChat] Client error", err);
    });
});
```

**Why:** Better logging and error handling so you can track what's happening.

---

## **PHASE 4: VERIFY SERVER STARTUP IN MAIN**

### **Step 4.1: Make Server Startup Blocking**

**File:** `src/index.ts`

**Change:** Ensure server startup succeeds before continuing

```typescript
// Around line 145-160, CHANGE:

async function main() {
    // ... existing code ...

    const router = new ChannelRouter();
    router.register(new TelegramChannel());
    router.register(new WhatsAppChannel());
    router.register(new WebChatChannel());

    // ... task handler registration ...

    // ADD ERROR HANDLING FOR CHANNEL STARTUP
    try {
        log.info("🚀 Starting all channels...");
        await router.startAll();
        log.info("✅ All channels started successfully");
    } catch (err) {
        log.error("❌ FATAL: Channel startup failed, exiting", err);
        process.exit(1); // EXIT WITH ERROR
    }

    // ... rest of code only runs if startup succeeded ...
```

**Why:** Server will exit immediately if WebSocket server can't start, rather than hiding the error.

---

## **PHASE 5: ADD HEALTH CHECK ENDPOINT**

### **Step 5.1: Create Health Status Endpoint**

**File:** `src/server.ts`

**Change:** Add diagnostic endpoint

```typescript
// Add this route BEFORE the webhook handler (around line 60):

/**
 * Health check endpoint - returns server status
 */
app.get("/api/health", (req, res) => {
    const health = {
        status: "ok",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        server: {
            listening: true,
            port: config.PORT || 3000,
            wsClients: (wss as any).clients?.size || 0
        }
    };

    res.json(health);
});

/**
 * WebSocket diagnostic endpoint - returns WebSocket info
 */
app.get("/api/ws-info", (req, res) => {
    const handlers = (wss as any)._events?.connection;
    const isHandlerRegistered = !!handlers;
    
    res.json({
        status: "ok",
        websocket: {
            server_exists: !!wss,
            handlers_registered: isHandlerRegistered,
            connected_clients: (wss as any).clients?.size || 0,
            ready_for_connections: wss && isHandlerRegistered
        }
    });
});
```

**Why:** You can now visit `http://localhost:3000/api/health` to verify the server is running and ready for WebSocket connections.

---

## **PHASE 6: TESTING PLAN**

### **Step 6.1: Start Fresh**

```bash
# Terminal 1: Kill all node processes
killall node

# Start server with full logging
npm start

# LOOK FOR:
# ✅ "🚀 Web server listening on http://localhost:3000"
# ✅ "Starting all channels..."
# ✅ "Starting channel: webchat..."
# ✅ "✅ Channel started: webchat"
# ✅ "Starting channel: telegram..."
# ✅ Starting channel: whatsapp..."
```

---

### **Step 6.2: Verify Health Endpoints**

```bash
# Terminal 2: Check server health
curl http://localhost:3000/api/health

# EXPECTED:
# {"status":"ok", "server":{"listening":true, "wsClients": 0}}

curl http://localhost:3000/api/ws-info

# EXPECTED:
# {"websocket":{"server_exists":true, "handlers_registered":true, "connected_clients":0, ...}}
```

---

### **Step 6.3: Open Browser and Monitor**

```
1. Open http://localhost:3000/dashboards.html#/settings
2. Open DevTools (F12) → Console
3. EXPECT TO SEE:
   ✅ "[HH:MM:SS] 🔗 Attempting WebSocket connection to: ws://localhost:3000/"
   ✅ "[HH:MM:SS] ✓ WebSocket object created (readyState: 0)"
   ✅ "[HH:MM:SS] ✅ WebSocket OPEN - Connection successful!"

4. In server logs, EXPECT:
   ✅ "📡 [WebChat] New WebSocket client connected"

5. Refresh page to test reconnection:
   ✅ Browser: "❌ WebSocket CLOSED"
   ✅ Server: "📡 [WebChat] Client disconnected"
   ✅ Browser: Reconnects automatically
   ✅ Server: "📡 [WebChat] New WebSocket client connected"
```

---

### **Step 6.4: Test Tool Call**

Once connected, verify a tool call works:

**Browser Console:**
```javascript
window.dashboard.callTool('getVoiceSettings', { sessionId: 'test' })
  .then(r => console.log('✅ Tool result:', r))
  .catch(e => console.error('❌ Tool error:', e))
```

**EXPECTED RESULTS:**
- Browser sees tool response
- Server logs show: `🔧 Tool call received: getVoiceSettings`
- Server logs show: `🔧 Executing tool: getVoiceSettings`
- Server logs show: `✓ Tool result: success=...`

---

## **PHASE 7: FIX CHECKLIST**

### **Critical Fixes (Must Do)**

- [ ] **Fix 1:** Add error handler to `startServer()` in `src/server.ts` (Step 2.1)
- [ ] **Fix 2:** Make channel startup errors fatal in `src/channels/router.ts` (Step 2.2)
- [ ] **Fix 3:** Make server startup verification in `src/index.ts` (Step 4.1)
- [ ] **Fix 4:** Remove duplicate handler in `src/server.ts` (Step 3.1)

### **Important Logging (Highly Recommended)**

- [ ] **Logging 1:** Add WebChat connection logging in `src/channels/webchat.ts` (Step 2.3)
- [ ] **Logging 2:** Add browser connection logging in `public/dashboard-common.js` (Step 2.4)
- [ ] **Logging 3:** Add health check endpoints in `src/server.ts` (Step 5.1)

### **Nice-to-Have (Optional)**

- [ ] Remove generic handler from `src/server.ts` for cleaner code (Step 3.1)
- [ ] Enhanced error handling in WebChat (Step 3.2)

---

## **EXPECTED OUTCOMES AFTER FIXES**

| Symptom | Before | After |
|---------|--------|-------|
| Server startup error | Hidden, continues running | **Fails fast with clear error message** |
| WebSocket connection fails | Silent, page shows "Loading..." forever | **Browser shows "WebSocket ERROR: ..."** |
| Port already in use | "Random WebSocket connection" logged, but no connection | **Immediate fatal error: "Port 3000 already in use"** |
| Tool call sent | Nothing happens | **Server logs tool execution, returns data** |
| Dashboard loads content | Never (due to no WebSocket) | **✅ Loads voice settings, analytics, etc.** |

---

## **TIMELINE ESTIMATE**

| Phase | Time |
|-------|------|
| Phase 1: Diagnosis | 5 min |
| Phase 2: Add Logging | 15 min |
| Phase 3: Consolidate Handlers | 10 min |
| Phase 4: Verify Startup | 5 min |
| Phase 5: Health Endpoints | 10 min |
| Phase 6: Testing | 20 min |
| **Total** | **~65 minutes** |

---

## **NEXT STEPS**

Implement phases in this order:

1. **Phase 1 (Diagnose)** - Understand the actual problem
2. **Phase 2 (Logging)** - Add visibility into what's happening
3. **Phase 3+4** - Core architectural fixes
4. **Phase 5** - Add diagnostic endpoints
5. **Phase 6** - Test and verify fixes work

This approach minimizes risk by diagnosing before fixing, and adding observability before making changes.
