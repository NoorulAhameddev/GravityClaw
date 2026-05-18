# Graph Report - D:\Projects\GravityClaw\mobile-companion  (2026-04-28)

## Corpus Check
- Corpus is ~1,488 words - fits in a single context window. You may not need a graph.

## Summary
- 13 nodes · 26 edges · 2 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]

## God Nodes (most connected - your core abstractions)
1. `addLog()` - 9 edges
2. `handleAction()` - 5 edges
3. `send()` - 4 edges
4. `sendLocation()` - 4 edges
5. `sendDeviceInfo()` - 3 edges
6. `startScreenRecording()` - 3 edges
7. `stopScreenRecording()` - 3 edges
8. `connect()` - 2 edges
9. `sendBatteryStatus()` - 2 edges
10. `captureCamera()` - 2 edges

## Surprising Connections (you probably didn't know these)
- `sendDeviceInfo()` --calls--> `addLog()`  [EXTRACTED]
  D:\Projects\GravityClaw\mobile-companion\App.tsx → D:\Projects\GravityClaw\mobile-companion\App.tsx  _Bridges community 1 → community 0_

## Communities

### Community 0 - "Community 0"
Cohesion: 0.43
Nodes (5): send(), sendBatteryStatus(), sendDeviceInfo(), sendLocation(), showNotification()

### Community 1 - "Community 1"
Cohesion: 0.47
Nodes (6): addLog(), captureCamera(), connect(), handleAction(), startScreenRecording(), stopScreenRecording()