# Command Palette — Quick Reference

## 🚀 Getting Started (30 seconds)

1. **Open Dashboard**: Navigate to your Gravity Claw dashboard
2. **Press**: `Cmd+K` (Mac) or `Ctrl+K` (Windows/Linux)
3. **Type**: Start searching (e.g., "dashboard", "settings")
4. **Execute**: Press `Enter` or click a command
5. **Close**: Press `ESC`

## ⌨️ Keyboard Shortcuts

```
Cmd/Ctrl+K    Open/Close palette
↑ / ↓         Navigate commands
Enter         Execute selected command
Esc           Close palette
Type          Search commands
```

## 📝 Available Commands

### Navigation
- `Go to Chat` — Chat interface
- `Go to Dashboard` — Analytics view
- `Go to Memory` — Knowledge graph
- `Go to Tools` — Tools management
- `Go to Scheduler` — Task scheduling

### Settings
- `Toggle Voice Mode` — Enable/disable voice
- `Change TTS Provider` — Switch text-to-speech
- `Toggle Notifications` — On/off notifications
- `Open Settings` — Full settings panel

### Dashboard Actions
- `Refresh Dashboard` — Reload all data
- `Export Data` — Download as JSON
- `Clear Cache` — Clear storage and cache

### System
- `Show Help` — Documentation
- `Show Shortcuts` — Keyboard cheat sheet
- `Report Bug` — Bug report form
- `Toggle Dark Mode` — Light/dark theme

## 🔍 Search Tips

**Fuzzy matching** (type partial text):
- `dash` → "Go to Dashboard"
- `ref` → "Refresh Dashboard"
- `voice` → "Toggle Voice Mode"
- `export` → "Export Data"

**Search is case-insensitive** and matches characters in order.

## 💾 Features

✅ **Command History** — Last 10 commands remembered
✅ **Keyboard Only** — Full keyboard navigation
✅ **Async Support** — Loading states for long operations
✅ **Toast Feedback** — Success/error notifications
✅ **Mobile Friendly** — Works on all devices
✅ **Dark Theme** — Beautiful dark dashboard integration

## 🛠️ For Developers

### Access Programmatically

```javascript
const palette = CommandPalette.getInstance();

palette.open();                    // Open palette
palette.close();                   // Close palette
palette.showToast('Message', 'ok'); // Show notification
```

### Add Custom Commands

Edit `public/components/command-palette.js`:

```javascript
this.allCommands.push({
  id: 'my-command',
  name: 'My Command',
  category: 'Custom',
  icon: '⚡',
  handler: () => { /* your code */ },
  description: 'What this does'
});
```

### Customize Theme

Edit CSS variables in `public/index.html`:

```css
:root {
  --cmd-bg-primary: #1e1e1e;   /* Modal background */
  --cmd-accent: #007acc;        /* Highlight color */
  --cmd-text-primary: #e0e0e0;  /* Text color */
}
```

## 📂 Files

```
public/
├── components/
│   ├── command-palette.js           Main component (~850 lines)
│   ├── COMMAND_PALETTE_README.md    Full documentation
│   ├── INTEGRATION_GUIDE.md         Integration instructions
│   └── QUICK_REFERENCE.md          This file
└── index.html                       Updated with CSS & script
```

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Shortcut doesn't work | Check console for errors, verify script loaded |
| Search not finding commands | Try exact command name or part of description |
| Commands not executing | Check browser console for JavaScript errors |
| Styling looks wrong | Verify CSS loaded, check z-index conflicts |
| History not saving | Check if localStorage enabled in browser |

## 📚 Resources

- **Full Docs**: [COMMAND_PALETTE_README.md](./COMMAND_PALETTE_README.md)
- **Integration**: [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md)
- **Component**: [command-palette.js](./command-palette.js)

## 🎯 Common Tasks

### Open specific page
```
Cmd+K → type "chat" → Enter
Cmd+K → type "scheduler" → Enter
```

### Toggle a setting
```
Cmd+K → type "voice" → Enter
Cmd+K → type "notifications" → Enter
```

### Refresh data
```
Cmd+K → type "refresh" → Enter
```

### Quick help
```
Cmd+K → type "help" → Enter
Cmd+K → type "shortcuts" → Enter
```

### Export data
```
Cmd+K → type "export" → Enter
```

## 💡 Pro Tips

1. **Use prefixes** for faster searching:
   - `test` for testing commands
   - `dashboard` for dashboard actions
   - `voice` for voice settings

2. **Check command history** — Recent commands appear first

3. **Keyboard navigation** is fastest for power users

4. **Mobile friendly** — Full touch support, no mouse needed

5. **Works offline** — No internet required for palette

## 📞 Support

For issues or feature requests:
1. Open browser Developer Tools (F12)
2. Check Console tab for error messages
3. Verify all files are loaded correctly
4. Test with simpler commands first

---

**Commands loaded: 16 | History: up to 10 commands | Theme: Automatic**

Press `Cmd/Ctrl+K` to start! 🚀
