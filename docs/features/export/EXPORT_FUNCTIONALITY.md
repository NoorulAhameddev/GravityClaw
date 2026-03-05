# Data Export Functionality

Complete guide for exporting data from Gravity Claw sessions.

## Overview

The export tools allow you to download your conversation history, knowledge graph, memory facts, and usage analytics in multiple formats:

- **Chat History**: Conversation transcripts (JSON/Markdown)
- **Memory Export**: Facts, entities, and relationship graphs (JSON/Markdown)
- **Usage Stats**: Token usage and cost analytics (JSON/CSV)
- **Knowledge Graph**: Entity relationships (JSON/GraphML)

## Quick Start

### Using the Dashboard

1. Navigate to the **Dashboard** or **Settings** section
2. Scroll to the **📦 Data Export** section  
3. Click the export button for the data type you want
4. Choose the export format
5. Optionally enable compression (gzip)
6. Click **Export** to download

### Using CLI/WebSocket (app.js)

```javascript
// Export chat history
const result = await callTool('exportChatHistory', {
  sessionId: 'my-session',
  format: 'json',      // 'json' or 'markdown'
  compress: true       // optional, default true
});

// Export memory
const result = await callTool('exportMemory', {
  sessionId: 'my-session',
  format: 'markdown',  // 'json' or 'markdown'
  limit: 500           // optional, max items
});

// Export usage stats
const result = await callTool('exportUsageStats', {
  sessionId: 'my-session',
  format: 'csv',       // 'json' or 'csv'
  dateFrom: '2024-01-01',  // optional ISO date
  dateTo: '2024-12-31'     // optional ISO date
});

// Export knowledge graph
const result = await callTool('exportGraph', {
  sessionId: 'my-session',
  format: 'json'       // 'json' or 'graphml'
});
```

### Using REST API

```bash
# Export chat history
curl -X POST http://localhost:3000/api/tools/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "exportChatHistory",
    "input": {
      "sessionId": "my-session",
      "format": "json"
    }
  }'

# Download exported file
curl -G http://localhost:3000/api/export/download \
  --data-urlencode "filename=chat-history.json.gz" \
  --data-urlencode "data=<base64-data>" \
  -o download.json.gz
```

## Export Tools

### exportChatHistory
Export conversation messages and metadata.

**Input:**
- `sessionId` (string, required): Session to export
- `format` (string): 'json' or 'markdown' (default: 'json')
- `limit` (number): Maximum messages (default: 1000)
- `offset` (number): Skip messages (default: 0)
- `compress` (boolean): Enable gzip (default: true)

**Output:**
```json
{
  "success": true,
  "data": {
    "format": "json",
    "messageCount": 42,
    "totalAvailable": 42,
    "base64": "...",
    "filename": "chat-history-my-session.json.gz",
    "compressed": true,
    "size": 1234
  }
}
```

**Markdown Format:**
```markdown
# Chat History Export

**Export Date:** 2024-03-04T10:30:00.000Z
**Session ID:** my-session
**Total Messages:** 42

---

## User
*Mon, Mar 4, 10:30 AM*

Hello, how are you?

---

## Assistant
*Mon, Mar 4, 10:30 AM*

I'm doing well, thank you for asking!

---
```

### exportMemory
Export facts, entities, and relationships from the knowledge graph.

**Input:**
- `sessionId` (string, required): Session to export
- `format` (string): 'json' or 'markdown' (default: 'json')
- `limit` (number): Maximum items per category (default: 500)
- `compress` (boolean): Enable gzip (default: true)

**Output:**
```json
{
  "success": true,
  "data": {
    "format": "json",
    "stats": {
      "facts": 15,
      "entities": 8,
      "relationships": 12
    },
    "base64": "...",
    "filename": "memory-my-session.json.gz",
    "compressed": true,
    "size": 2048
  }
}
```

**JSON Structure:**
```json
{
  "metadata": {
    "exportDate": "2024-03-04T10:30:00.000Z",
    "sessionId": "my-session",
    "format": "json",
    "compressed": false
  },
  "facts": [
    {
      "id": 1,
      "content": "User prefers Python over JavaScript",
      "category": "preferences",
      "createdAt": "2024-03-01T08:00:00.000Z",
      "accessCount": 5,
      "importance": 0.8
    }
  ],
  "entities": [
    {
      "id": 1,
      "name": "Python",
      "type": "technology",
      "properties": {
        "version": "3.11",
        "useCase": "data science"
      },
      "accessCount": 12,
      "createdAt": "2024-03-01T08:00:00.000Z"
    }
  ],
  "relationships": [
    {
      "id": 1,
      "fromEntityName": "User",
      "toEntityName": "Python",
      "relationType": "prefers",
      "metadata": {
        "confidence": 0.9
      },
      "createdAt": "2024-03-02T10:00:00.000Z"
    }
  ],
  "stats": {
    "totalFacts": 15,
    "totalEntities": 8,
    "totalRelationships": 12
  }
}
```

### exportUsageStats
Export token usage and cost analytics.

**Input:**
- `sessionId` (string, optional): Filter by session
- `format` (string): 'json' or 'csv' (default: 'json')
- `dateFrom` (string): ISO date from (optional)
- `dateTo` (string): ISO date to (optional)
- `limit` (number): Maximum records (default: 10000)
- `compress` (boolean): Enable gzip (default: true)

**Output:**
```json
{
  "success": true,
  "data": {
    "format": "json",
    "recordCount": 156,
    "summary": {
      "totalRecords": 156,
      "totalTokens": 45230,
      "totalPromptTokens": 12450,
      "totalCompletionTokens": 32780,
      "totalCost": 2.456,
      "avgLatency": 1250,
      "models": [
        {
          "model": "gpt-4",
          "calls": 45,
          "tokens": 20000,
          "cost": 1.200
        }
      ]
    },
    "base64": "...",
    "filename": "usage-export.json.gz",
    "compressed": true,
    "size": 3456
  }
}
```

**CSV Format:**
```csv
# Usage Export Report
# Export Date: 2024-03-04T10:30:00.000Z
# Total Records: 156
# Total Cost: $2.456000
# Total Tokens: 45230

Timestamp,Session ID,Model,Prompt Tokens,Completion Tokens,Total Tokens,Cost,Latency (ms),Provider
"2024-03-04T10:30:00.000Z","my-session","gpt-4",500,1200,1700,0.089,"1250","openai"
```

### exportGraph
Export knowledge graph in various formats.

**Input:**
- `sessionId` (string, required): Session to export
- `format` (string): 'json' or 'graphml' (default: 'json')
- `compress` (boolean): Enable gzip (default: true)

**Output:**
```json
{
  "success": true,
  "data": {
    "format": "json",
    "stats": {
      "totalNodes": 8,
      "totalEdges": 12,
      "nodeTypes": {
        "person": 3,
        "technology": 4,
        "concept": 1
      },
      "relationshipTypes": {
        "knows": 5,
        "uses": 4,
        "related_to": 3
      }
    },
    "base64": "...",
    "filename": "graph-my-session.json.gz",
    "compressed": true,
    "size": 1890
  }
}
```

**GraphML Format:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<graphml xmlns="http://graphml.graphdrawing.org/xmlformat/graphml/1.0/graphml.xsd">
  <graph id="KnowledgeGraph" edgedefault="directed">
    <data key="sessionId">my-session</data>
    <data key="exportDate">2024-03-04T10:30:00.000Z</data>
    
    <node id="node_1" label="Alice">
      <data key="type">person</data>
      <data key="accessCount">5</data>
    </node>
    
    <edge id="edge_1" source="node_1" target="node_2" label="knows: Alice → Bob">
      <data key="relationType">knows</data>
    </edge>
  </graph>
</graphml>
```

## Data Formats

### JSON Format
- Structured data with metadata
- Perfect for data analysis and re-import
- Includes comprehensive statistics
- Human-readable when not compressed

### Markdown Format
- Human-readable text documents
- Organized with headers by category
- Suitable for documentation and sharing
- Great for version control
- Can be converted to other formats

### CSV Format
- Spreadsheet-compatible
- One record per line
- Includes headers
- Easy to analyze in Excel/Google Sheets
- Good for data visualization

### GraphML Format
- Standard graph format
- Compatible with Gephi, yEd, Cytoscape
- Edit and visualize knowledge graphs
- Preserve entity and relationship structure

## Compression

All exports support optional gzip compression:
- Reduces file size by ~80-90%
- Files saved as `.gz` extension
- Browser automatically handles decompression
- Beneficial for large exports (>1MB)

## Examples

### Export conversation as markdown for documentation
```javascript
const result = await callTool('exportChatHistory', {
  sessionId: 'meeting-2024-03-04',
  format: 'markdown'
});
// Download and convert to PDF for sharing
```

### Analyze usage costs over time
```javascript
const result = await callTool('exportUsageStats', {
  format: 'csv',
  dateFrom: '2024-01-01',
  dateTo: '2024-03-31'
});
// Open in Google Sheets and create charts
```

### Backup knowledge graph
```javascript
const result = await callTool('exportGraph', {
  sessionId: 'my-session',
  format: 'json'
});
// Store in version control or backup storage
```

### Visualize entity relationships
```javascript
const result = await callTool('exportGraph', {
  sessionId: 'my-session',
  format: 'graphml'
});
// Import into Gephi for visualization
```

## Utilities

The export tools come with utility functions:

```typescript
import { 
  getDownloadUrl,
  decodeExportData,
  parseExportJSON,
  saveExportToFile,
  formatExportSummary,
  summarizeMemoryExport,
  summarizeUsageExport,
  summarizeChatExport 
} from './src/tools/export/utils.ts';

// Generate a download link
const url = getDownloadUrl(result);

// Decode and parse locally
const data = decodeExportData(result.data.base64, result.data.compressed);
const parsed = parseExportJSON(data);

// Save to file system
saveExportToFile(result, './exports/my-export.json');

// Get summary of exported data
const summary = summarizeMemoryExport(parsed);
console.log(`Exported ${summary.facts} facts`);
```

## API Endpoints

### POST /api/tools/execute
Execute any registered tool via HTTP.

```bash
curl -X POST http://localhost:3000/api/tools/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "exportChatHistory",
    "input": {
      "sessionId": "my-session",
      "format": "json",
      "compress": true
    }
  }'
```

### GET /api/export/download
Download exported file.

```bash
curl -G http://localhost:3000/api/export/download \
  --data-urlencode "filename=chat-history.json.gz" \
  --data-urlencode "data=<base64-encoded-data>" \
  -o download.json.gz
```

## Best Practices

1. **Use compression** for exports larger than 1MB
2. **Set appropriate limits** to avoid memory issues (max 10,000 items)
3. **Export regularly** to maintain backups
4. **Use JSON** for data integrity and re-import capabilities
5. **Use Markdown** for human-readable documentation
6. **Use CSV** for analytics and spreadsheet tools
7. **Use GraphML** for graph visualization and analysis
8. **Store exports** in version control or secure backup
9. **Include metadata** in exported data (automatically done)
10. **Test imports** after export to ensure data integrity

## Troubleshooting

### Export is empty or has warning
- Session may not have data for that export type
- Check session ID is correct
- Verify memory/entities are saved

### File won't download
- Check browser download settings
- Ensure sufficient disk space
- Try without compression if file is corrupted

### Data looks truncated
- Increase `limit` parameter
- Use pagination with `offset`
- Check file size matches download

### Encoding issues in imports
- Ensure UTF-8 encoding compatibility
- Decode base64 data first
- Check decompression if using gzip

## Format Support

| Format | Tools | Use Case |
|--------|-------|----------|
| JSON | History, Memory, Usage, Graph | Data analysis, re-import, backup |
| Markdown | History, Memory | Documentation, sharing, version control |
| CSV | Usage | Spreadsheets, analytics, visualization |
| GraphML | Graph | Visualization, graph tools, analysis |

## File Size Estimates

Typical compressed file sizes (with gzip):

- Chat History (100 msg): 15-30 KB
- Memory (100 items): 20-40 KB
- Usage Stats (1000 records): 50-100 KB
- Knowledge Graph (100 nodes/edges): 30-50 KB

## Security

- No data is sent to external servers
- Exports are base64 encoded before download
- Compression happens locally
- Session context is NOT included in exports
- User authentication handled by existing channels

## Performance

- Chat export: ~50ms per 1000 messages
- Memory export: ~100ms per 1000 items
- Usage export: ~50ms per 1000 records
- Graph export: ~200ms per 1000 edges
- Compression: ~500ms per 1MB

## Future Enhancements

- [ ] Batch exports (all sessions)
- [ ] Schedule exports (daily/weekly)
- [ ] Direct cloud storage (S3, GCS)
- [ ] Email exports
- [ ] Import from exports
- [ ] Diff between exports
- [ ] Export filters (date range, tags)
- [ ] Signal format for real-time graphs
