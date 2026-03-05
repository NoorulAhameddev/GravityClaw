# Command Palette — Integration Guide

This guide shows how to integrate the Command Palette with your Gravity Claw dashboard and expose dashboard functionality via the command handlers.

## Quick Start

### 1. Verify Installation

The command palette is already integrated. Verify these files exist:

```
public/
├── components/
│   ├── command-palette.js      ✓ Main component
│   └── COMMAND_PALETTE_README.md  ✓ Documentation
└── index.html                  ✓ Updated with CSS & script
```

### 2. Test It Out

1. Open the dashboard in your browser
2. Press `Cmd+K` (Mac) or `Ctrl+K` (Windows/Linux)
3. The command palette should appear with a search box
4. Type "dash" to find "Go to Dashboard"
5. Press Enter to execute

## Integrating Dashboard Functions

The Command Palette includes handlers for common commands, but you need to wire them up to your dashboard implementation. Here's how:

### Method 1: Expose Dashboard API (Recommended)

Create a global `dashboardAPI` object that the command palette can call:

```javascript
// Add this to your main dashboard script (after page setup)
window.dashboardAPI = {
  // Navigation
  goToChat: () => {
    showPage('chat');
  },
  
  goToDashboard: () => {
    showPage('overview');
  },
  
  goToMemory: () => {
    showPage('memory');
  },
  
  goToScheduler: () => {
    showPage('scheduler');
  },
  
  // Settings
  toggleVoiceMode: () => {
    const current = localStorage.getItem('voice-mode') === 'true';
    localStorage.setItem('voice-mode', String(!current));
    return !current;
  },
  
  // Dashboard actions
  refresh: async () => {
    await loadHealth();
    await loadStats();
    return 'Dashboard refreshed';
  },
  
  // Other methods...
};
```

Then update the command handlers in `command-palette.js`:

```javascript
navigateToChat() {
  if (window.dashboardAPI?.goToChat) {
    window.dashboardAPI.goToChat();
  }
}
```

### Method 2: Direct Hash Navigation

The current implementation uses hash-based routing. Commands already support this:

```javascript
navigateToChat() {
  window.location.hash = '#chat';  // Already implemented
}

navigateToDashboard() {
  window.location.hash = '#dashboard';  // Already implemented
}
```

This works if your pages respond to hash changes. The dashboard already has this:

```javascript
// In index.html main script
const hash = window.location.hash.replace('#', '');
if (hash && pageTitles[hash]) { 
  showPage(hash);  // Shows the page when hash changes
}
```

### Method 3: Hybrid Approach

Combine both methods for maximum flexibility:

```javascript
navigateToDashboard() {
  // Try API first, fall back to hash
  if (window.dashboardAPI?.goToDashboard) {
    window.dashboardAPI.goToDashboard();
  } else {
    window.location.hash = '#dashboard';
  }
}
```

## Integrating Settings Commands

### Voice Mode Toggle

The implementation is already complete and uses localStorage:

```javascript
toggleVoiceMode() {
  const isEnabled = localStorage.getItem('voice-mode') === 'true';
  localStorage.setItem('voice-mode', String(!isEnabled));
  const newState = !isEnabled ? 'enabled' : 'disabled';
  this.showToast(`Voice mode ${newState}`);
}
```

To wire it to your voice system:

```javascript
// Hook into your voice system initialization
class VoiceSystem {
  constructor() {
    this.enabled = localStorage.getItem('voice-mode') === 'true';
    this.setupListeners();
  }
  
  setupListeners() {
    document.addEventListener('voicemode-changed', () => {
      this.enabled = localStorage.getItem('voice-mode') === 'true';
      this.enabled ? this.start() : this.stop();
    });
  }
}

// When command palette toggles voice mode:
document.dispatchEvent(new CustomEvent('voicemode-changed'));
```

### TTS Provider Selection

The command has a built-in provider cycle:

```javascript
changeTTSProvider() {
  const providers = ['elevenlabs', 'google', 'azure', 'openai'];
  const current = localStorage.getItem('tts-provider') || 'elevenlabs';
  const idx = providers.indexOf(current);
  const next = providers[(idx + 1) % providers.length];
  localStorage.setItem('tts-provider', next);
  this.showToast(`TTS provider: ${next}`);
}
```

Wire it to your TTS system:

```javascript
// Hook into your TTS system
class TTSSystem {
  setupProviders() {
    const providers = ['elevenlabs', 'google', 'azure', 'openai'];
    const initial = localStorage.getItem('tts-provider') || 'elevenlabs';
    this.setProvider(initial);
    
    document.addEventListener('tts-provider-changed', () => {
      const current = localStorage.getItem('tts-provider');
      this.setProvider(current);
    });
  }
  
  setProvider(name) {
    // Initialize provider...
    console.log(`TTS Provider set to: ${name}`);
  }
}

// Dispatch event when provider changes
document.dispatchEvent(new CustomEvent('tts-provider-changed'));
```

## Integrating Dashboard Actions

### Refresh Dashboard

Update the handler to call your loader functions:

```javascript
// In command-palette.js, modify the refreshDashboard handler:
async refreshDashboard() {
  try {
    // Call your dashboard refresh functions
    if (typeof loadHealth === 'function') {
      await loadHealth();
    }
    if (typeof loadStats === 'function') {
      await loadStats();
    }
    // Or use dashboard API if available
    if (window.dashboardAPI?.refresh) {
      await window.dashboardAPI.refresh();
    }
    return 'Dashboard refreshed';
  } catch (error) {
    throw new Error('Failed to refresh dashboard');
  }
}
```

### Export Data

The current implementation exports localStorage settings:

```javascript
async exportData() {
  const data = {
    exported: new Date().toISOString(),
    sessionId: localStorage.getItem('session-id') || 'unknown',
    settings: {/* ... */},
    commandHistory: this.commandHistory,
  };
  // ... download as JSON
}
```

To export full dashboard data:

```javascript
async exportData() {
  try {
    // Collect all data
    const data = {
      exported: new Date().toISOString(),
      dashboard: {
        health: window.lastHealth || {},
        stats: window.lastStats || {},
        sessions: await fetchSessions(),
        analytics: await fetchAnalytics(),
      },
      settings: {
        voiceMode: localStorage.getItem('voice-mode'),
        ttsProvider: localStorage.getItem('tts-provider'),
        // ... other settings
      },
      history: this.commandHistory,
    };
    
    // Download
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gravity-claw-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    return 'Data exported successfully';
  } catch (error) {
    throw new Error('Failed to export data');
  }
}
```

### Clear Cache

The implementation clears localStorage and IndexedDB:

```javascript
async clearCache() {
  const keysToKeep = ['session-id', 'voice-mode', 'tts-provider'];
  const allKeys = Object.keys(localStorage);
  
  allKeys.forEach((key) => {
    if (!keysToKeep.includes(key)) {
      localStorage.removeItem(key);
    }
  });
  
  // Also clears indexedDB...
  return 'Cache cleared successfully';
}
```

To clear application caches too:

```javascript
async clearCache() {
  try {
    // Clear localStorage (selective)
    const keysToKeep = ['session-id', 'voice-mode', 'tts-provider'];
    Object.keys(localStorage)
      .filter(k => !keysToKeep.includes(k))
      .forEach(k => localStorage.removeItem(k));
    
    // Clear sessionStorage
    sessionStorage.clear();
    
    // Clear IndexedDB
    if ('indexedDB' in window) {
      const dbs = await indexedDB.databases?.();
      if (dbs) {
        for (const db of dbs) {
          indexedDB.deleteDatabase(db.name);
        }
      }
    }
    
    // Clear service worker cache (if using)
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map(name => caches.delete(name))
      );
    }
    
    // Clear browser cache (via API call if available)
    if (window.dashboardAPI?.clearCache) {
      await window.dashboardAPI.clearCache();
    }
    
    return 'Cache cleared successfully';
  } catch (error) {
    throw new Error('Failed to clear cache');
  }
}
```

## Integrating Settings Panel

Update the `openSettings` handler to match your settings UI:

```javascript
openSettings() {
  // Method 1: Hash navigation
  window.location.hash = '#settings';
  
  // Method 2: Show settings modal
  if (window.dashboardAPI?.showSettings) {
    window.dashboardAPI.showSettings();
  }
  
  // Method 3: Open settings page
  if (typeof showPage === 'function') {
    showPage('settings');
  }
  
  this.showToast('⚙️ Opening settings...');
}
```

## Integrating Help & Shortcuts

The command palette includes built-in help. To customize:

```javascript
showHelp() {
  const helpHtml = `
    <div style="padding: 20px; font-size: 14px; line-height: 1.6;">
      <h3>Gravity Claw Help</h3>
      <p><strong>Command Palette:</strong> Press Cmd+K (Mac) or Ctrl+K (Windows/Linux)</p>
      <p><strong>Documentation:</strong> <a href="https://docs.example.com" target="_blank">Visit Docs</a></p>
      <p><strong>Report Issues:</strong> <a href="https://github.com/example/repo/issues" target="_blank">Open Issue</a></p>
    </div>
  `;
  this.showModal('Help', helpHtml);
}

showShortcuts() {
  const shortcuts = `
    <div style="padding: 20px; font-size: 13px; line-height: 1.8;">
      <table style="width: 100%;">
        <tr>
          <td style="padding: 8px;"><strong>Cmd/Ctrl+K</strong></td>
          <td style="padding: 8px;">Open Command Palette</td>
        </tr>
        <tr>
          <td style="padding: 8px;"><strong>Cmd/Ctrl+/</strong></td>
          <td style="padding: 8px;">Help (custom)</td>
        </tr>
        <!-- Add more shortcuts -->
      </table>
    </div>
  `;
  this.showModal('Keyboard Shortcuts', shortcuts);
}
```

## Adding Custom Commands

To add your own commands, modify the constructor in `command-palette.js`:

```javascript
// In the allCommands array, add:
{
  id: 'custom-export-csv',
  name: 'Export as CSV',
  category: 'Custom',
  icon: '📄',
  handler: async () => {
    // Your logic here
    const csv = await generateCSV();
    downloadFile(csv, 'data.csv');
    return 'Exported as CSV';
  },
  description: 'Export dashboard data as CSV file',
  isAsync: true // Show loading state
}
```

## Testing the Integration

### Unit Test Example

```javascript
// test-command-palette.js
describe('CommandPalette Integration', () => {
  let palette;
  
  before(() => {
    palette = CommandPalette.getInstance();
  });
  
  it('should navigate to dashboard', () => {
    const cmd = palette.allCommands.find(c => c.id === 'nav-dashboard');
    expect(cmd).toBeDefined();
    expect(cmd.handler).toBeDefined();
  });
  
  it('should toggle voice mode', () => {
    const cmd = palette.allCommands.find(c => c.id === 'settings-voice');
    localStorage.setItem('voice-mode', 'false');
    cmd.handler();
    expect(localStorage.getItem('voice-mode')).toBe('true');
  });
  
  it('should perform fuzzy search', () => {
    const results = palette.fuzzySearch('dash', palette.allCommands);
    expect(results.some(r => r.name === 'Go to Dashboard')).toBe(true);
  });
});
```

### Manual Testing Checklist

- [ ] Cmd+K / Ctrl+K opens palette
- [ ] Search filters commands correctly
- [ ] Arrow keys navigate
- [ ] Enter executes selected command
- [ ] ESC closes palette
- [ ] Navigation commands change pages
- [ ] Toggle commands update settings
- [ ] Async commands show loading state
- [ ] Toast notifications appear
- [ ] Command history persists
- [ ] Mobile responsive
- [ ] Dark theme applies

## Debugging Tips

### Enable Debug Logging

```javascript
// In command-palette.js, add logging:
const palette = CommandPalette.getInstance();

// Hook into executeCommand
const original = palette.executeCommand;
palette.executeCommand = async function(cmd) {
  console.log('CMD.EXEC', cmd.id, cmd.name);
  try {
    const result = await original.call(this, cmd);
    console.log('CMD.OK', cmd.id, result);
    return result;
  } catch (e) {
    console.error('CMD.ERR', cmd.id, e);
    throw e;
  }
};
```

### Check Search Performance

```javascript
const palette = CommandPalette.getInstance();
console.time('search');
palette.fuzzySearch('test', palette.allCommands);
console.timeEnd('search');
```

### Verify DOM Structure

```javascript
// In browser console
document.getElementById('command-palette-root');
document.getElementById('cmd-search');
document.getElementById('cmd-list');
```

## Common Integration Patterns

### 1. Command Callback Pattern

```javascript
// Execute command and get result
const palette = CommandPalette.getInstance();
palette.executeCommand(cmd).then(result => {
  console.log('Command completed:', result);
});
```

### 2. History-Based Navigation

```javascript
// Re-execute last command
const last = palette.commandHistory[0];
if (last) {
  const cmd = palette.allCommands.find(c => c.id === last.id);
  palette.executeCommand(cmd);
}
```

### 3. Dynamic Command Registration

```javascript
// Add command at runtime
palette.allCommands.push({
  id: 'dynamic-cmd',
  name: 'Dynamic Command',
  category: 'Runtime',
  icon: '⚡',
  handler: () => console.log('Dynamic!'),
  description: 'Added at runtime'
});
```

## Next Steps

1. **Test** the command palette works with `Cmd/Ctrl+K`
2. **Customize** commands for your specific use case
3. **Wire** dashboard functions as shown above
4. **Add** more commands as needed
5. **Style** to match your brand (modify CSS variables)

---

For detailed API reference, see [COMMAND_PALETTE_README.md](./COMMAND_PALETTE_README.md)
