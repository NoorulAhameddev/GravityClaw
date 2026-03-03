# Live Canvas - Feature Documentation

## Overview

The Live Canvas feature enables Gravity Claw agents to push interactive HTML/JS widgets to web clients in real-time. It implements the A2UI (Agent-to-User Interface) protocol where agents generate UI, users interact with it, and agents can update the UI dynamically.

## Architecture

### Components

1. **Backend (src/canvas/index.ts)**
   - WebSocket connection management
   - `canvas_push()` function for sending widgets
   - Content validation and security checks
   - `canvasPushTool` - LLM-accessible tool

2. **Server Integration (src/server.ts)**
   - WebSocket endpoint: `ws://localhost:3000/canvas?session=<session_id>`
   - Automatic client registration
   - Connection lifecycle management

3. **Frontend (public/canvas.html)**
   - WebSocket client with auto-reconnect
   - Sandboxed iframe for widget rendering
   - CSP headers for security
   - Interactive UI with status indicators

## Usage

### For Users

1. **Open the Canvas Client:**
   ```
   http://localhost:3000/canvas.html?session=my-session-id
   ```

2. **The agent can push widgets using the `canvas_push` tool:**
   - Interactive forms
   - Data visualizations
   - Charts and graphs
   - Custom UI components

### For Agents/LLM

The agent can use the `canvas_push` tool to send widgets to connected clients:

```json
{
  "name": "canvas_push",
  "arguments": {
    "session_id": "user-session-123",
    "html": "<div><h1>Hello!</h1><button id='btn'>Click Me</button></div>",
    "js": "document.getElementById('btn').addEventListener('click', () => alert('Clicked!'));"
  }
}
```

### Example Use Cases

#### 1. Interactive Form
```html
<!-- HTML -->
<form id="feedback">
  <label>Name: <input type="text" name="name" required></label><br>
  <label>Rating: 
    <select name="rating">
      <option value="5">⭐⭐⭐⭐⭐</option>
      <option value="4">⭐⭐⭐⭐</option>
      <option value="3">⭐⭐⭐</option>
    </select>
  </label><br>
  <button type="submit">Submit</button>
</form>
```

```javascript
// JavaScript
document.getElementById('feedback').addEventListener('submit', (e) => {
  e.preventDefault();
  const data = new FormData(e.target);
  console.log('Form data:', Object.fromEntries(data));
  alert('Thanks for your feedback!');
});
```

#### 2. Data Table
```html
<table border="1" style="border-collapse: collapse; width: 100%;">
  <thead>
    <tr style="background: #f0f0f0;">
      <th>Product</th>
      <th>Price</th>
      <th>Stock</th>
    </tr>
  </thead>
  <tbody>
    <tr><td>Widget A</td><td>$19.99</td><td>50</td></tr>
    <tr><td>Widget B</td><td>$29.99</td><td>30</td></tr>
    <tr><td>Widget C</td><td>$39.99</td><td>20</td></tr>
  </tbody>
</table>
```

#### 3. SVG Chart
```html
<svg width="400" height="200" style="border: 1px solid #ccc;">
  <rect x="50" y="150" width="50" height="100" fill="#4CAF50" />
  <rect x="150" y="100" width="50" height="150" fill="#2196F3" />
  <rect x="250" y="50" width="50" height="200" fill="#FF9800" />
  <text x="65" y="170" fill="white" font-size="12">Jan</text>
  <text x="165" y="120" fill="white" font-size="12">Feb</text>
  <text x="265" y="70" fill="white" font-size="12">Mar</text>
</svg>
```

#### 4. Custom Widget with Styling
```html
<style>
  .dashboard {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
    padding: 20px;
  }
  .card {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
  }
  .card h3 { margin: 0 0 10px 0; }
  .card .value { font-size: 32px; font-weight: bold; }
</style>
<div class="dashboard">
  <div class="card">
    <h3>Users</h3>
    <div class="value">1,234</div>
  </div>
  <div class="card">
    <h3>Revenue</h3>
    <div class="value">$45.6K</div>
  </div>
  <div class="card">
    <h3>Growth</h3>
    <div class="value">+23%</div>
  </div>
</div>
```

## Security

The Live Canvas implements strict security measures:

### Content Validation

**Blocked HTML patterns:**
- External scripts (`<script src="...">`)
- Inline event handlers (`onclick`, `onerror`, etc.)
- JavaScript protocol (`href="javascript:..."`)
- External iframes (except `about:blank` and `data:` URLs)
- Object/embed tags
- External stylesheets

**Blocked JavaScript patterns:**
- `eval()`
- `Function()` constructor
- `XMLHttpRequest`
- `fetch()`
- `.innerHTML` assignments
- `document.write()`

### Sandboxing

The canvas renders content in an iframe with:
- `sandbox="allow-scripts allow-same-origin"` attribute
- Strict CSP headers
- No access to parent window
- Isolated execution context

## Technical Details

### WebSocket Protocol

**Connection:**
```
ws://localhost:3000/canvas?session=<session_id>
```

**Messages from Server:**
```json
{
  "type": "connected",
  "sessionId": "session-123",
  "timestamp": "2026-03-01T10:00:00Z"
}

{
  "type": "canvas_push",
  "html": "<div>Widget content</div>",
  "js": "console.log('initialized');",
  "timestamp": "2026-03-01T10:00:00Z"
}

{
  "type": "pong"
}
```

**Messages from Client:**
```json
{
  "type": "ping"
}

{
  "type": "interaction",
  "data": { "action": "button_click", "value": "submit" }
}

{
  "type": "error",
  "error": "Widget rendering failed"
}
```

### API Reference

#### `registerCanvasClient(sessionId: string, ws: WebSocket): void`
Registers a new canvas WebSocket client.

#### `pushCanvas(sessionId: string, html: string, js?: string): Promise<string>`
Pushes HTML/JS content to a connected canvas client.

#### `hasCanvasClient(sessionId: string): boolean`
Checks if a session has an active canvas client.

#### `getConnectedCanvasClients(): string[]`
Returns array of all connected session IDs.

#### `canvasPushTool: Tool`
The tool definition for LLM access to canvas pushing.

## Testing

Run the test suite:
```bash
npm test src/__tests__/canvas.test.ts
```

Test coverage includes:
- ✅ WebSocket connection management (4 tests)
- ✅ Canvas push functionality (10 tests)
- ✅ Tool integration (5 tests)
- ✅ Client management (2 tests)
- ✅ Security validation (11 tests)
- ✅ Use case examples (4 tests)

**Total: 36 tests, all passing**

## Integration

The Live Canvas is automatically registered in `src/index.ts`:

```typescript
import { canvasPushTool } from "./canvas/index.ts";
// ...
registry.register(canvasPushTool);
```

The WebSocket handler is integrated in `src/server.ts`:

```typescript
import { registerCanvasClient } from "./canvas/index.ts";
// ...
wss.on("connection", (ws, req) => {
  if (pathname === "/canvas") {
    registerCanvasClient(sessionId, ws);
  }
});
```

## Future Enhancements

Potential improvements for the Live Canvas:

1. **Bidirectional Communication:** Allow widgets to send data back to the agent
2. **Widget State Management:** Persist widget state across reconnections
3. **Multiple Widgets:** Support multiple widgets in a single canvas
4. **Widget Templates:** Pre-built templates for common use cases
5. **Real-time Updates:** Server-side pushes for live data updates
6. **User Authentication:** Secure canvas access with authentication
7. **Widget Marketplace:** Share and reuse canvas widgets
8. **Analytics:** Track widget interactions and usage
9. **Mobile Support:** Responsive design for mobile devices
10. **Offline Mode:** Local caching for offline widget rendering

## Troubleshooting

### Canvas client not connecting

Check that:
1. The server is running on the correct port
2. WebSocket connections are not blocked by firewall
3. The session ID is correct in the URL

### Widget not rendering

Verify:
1. HTML is valid and not blocked by validation
2. JavaScript doesn't contain blocked patterns
3. Browser console for error messages
4. Network tab shows WebSocket message received

### Security validation errors

Review:
1. Remove external script/stylesheet references
2. Use event listeners instead of inline handlers
3. Replace `innerHTML` with `textContent` or DOM methods
4. Avoid `eval()`, `Function()`, `fetch()`, etc.

## License

Part of the Gravity Claw project.
