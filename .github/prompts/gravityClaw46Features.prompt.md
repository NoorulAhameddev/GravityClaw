# Plan: Gravity Claw Complete Feature Suite

This plan implements 38 new features across 8 phases, building on your existing Level 1 foundation (multi-channel support, agentic loop, basic SQLite memory, tool system). The implementation order prioritizes infrastructure first, then memory, voice, tools, advanced agents, proactive behaviors, UX, and finally platform-specific features. Each feature includes test coverage. Estimated total effort: 250-350 hours over 8-10 weeks.

**Key Decisions:**
- Skip 8 already-implemented features (WhatsApp, Telegram, WebChat, Multi-Channel Router, SQLite Memory basics, Shell Commands, Agentic Loop, Typing Indicators)
- Build LLM provider abstraction first to enable multi-model support
- Implement plugin system early as foundation for modular tools
- Voice features grouped together for efficient Whisper/ElevenLabs integration
- MCP bridge before Skills System (Skills can wrap MCP tools)
- Infrastructure setup included for Supabase, ElevenLabs, external APIs

---

## **Steps**

### **PHASE 1: Core Infrastructure & Testing (10 features)**

#### 1. Test Framework Setup
- Install Vitest (`npm install -D vitest @vitest/ui`)
- Create [vitest.config.ts](vitest.config.ts) with ES modules support
- Create [src/\_\_tests\_\_/](src/__tests__/) directory structure
- Add `test` and `test:ui` scripts to [package.json](package.json)
- Create sample tests for existing [src/llm.ts](src/llm.ts) and [src/agent.ts](src/agent.ts)
- Configure coverage reporting with `c8` or `@vitest/coverage-v8`

#### 2. LLM Provider Abstraction
- Create [src/llm/base.ts](src/llm/base.ts) with `LLMProvider` interface (methods: `chat`, `streamChat`, `listModels`)
- Create [src/llm/openrouter.ts](src/llm/openrouter.ts) - migrate existing OpenRouter logic
- Update [src/config.ts](src/config.ts) to add `LLM_PROVIDER` enum field
- Refactor [src/agent.ts](src/agent.ts) to use abstract provider
- Add provider factory in [src/llm/index.ts](src/llm/index.ts)

#### 3. Multi-LLM Providers
- Install SDKs: `npm install @anthropic-ai/sdk @google/generative-ai groq-sdk`
- Create [src/llm/openai.ts](src/llm/openai.ts) for native OpenAI API
- Create [src/llm/anthropic.ts](src/llm/anthropic.ts) with tool use conversion
- Create [src/llm/google.ts](src/llm/google.ts) for Gemini (convert tool schemas to Google format)
- Create [src/llm/groq.ts](src/llm/groq.ts) (uses OpenAI SDK)
- Create [src/llm/deepseek.ts](src/llm/deepseek.ts)
- Create [src/llm/ollama.ts](src/llm/ollama.ts) for local models (REST API)
- Update [src/config.ts](src/config.ts) with provider-specific API key fields
- Add `/model <provider> <model-name>` command to [src/channels/router.ts](src/channels/router.ts)
- Store active model in session metadata (add `settings` JSON column to `memory` table)

#### 4. Model Failover
- Create [src/llm/failover.ts](src/llm/failover.ts) wrapping multiple providers
- Add `LLM_FAILOVER_LIST` config (comma-separated provider list)
- Implement retry logic: catch API errors, 429s, timeouts → try next provider
- Log failover events to [src/logger.ts](src/logger.ts)
- Add circuit breaker pattern (skip provider after 3 consecutive failures)
- Add `/failover status` command to view provider health

#### 5. OpenRouter Enhancement
- Already implemented, but add OpenRouter model listing via `/models openrouter`
- Fetch from `https://openrouter.ai/api/v1/models`
- Cache model list for 1 hour in memory
- Display model pricing in `/models` output

#### 6. Plugin System (Trait-Based)
- Create [src/plugins/base.ts](src/plugins/base.ts) with traits: `Provider`, `Channel`, `Tool`, `Memory`
- Create [src/plugins/registry.ts](src/plugins/registry.ts) for plugin loading
- Create [plugins/](plugins/) directory for external plugins
- Define plugin manifest schema: `plugin.json` with name, version, main file, traits
- Load plugins at startup from [src/index.ts](src/index.ts)
- Example plugin: [plugins/example-tool/](plugins/example-tool/) with datetime tool ported

#### 7. Encrypted Secrets
- Install `npm install crypto` (built-in Node.js)
- Create [src/secrets.ts](src/secrets.ts) with AES-256-GCM encryption
- Add `MASTER_KEY` to [src/config.ts](src/config.ts) (required in .env)
- Create CLI tool [scripts/encrypt-secret.ts](scripts/encrypt-secret.ts)
- Store encrypted secrets in [secrets.enc.json](secrets.enc.json)
- Update [src/config.ts](src/config.ts) to decrypt at runtime
- Never log decrypted keys

#### 8. Slash Commands Expansion
- Already has `/start`, `/reset`, `/help` in [src/channels/telegram.ts](src/channels/telegram.ts)
- Add to [src/channels/router.ts](src/channels/router.ts): `/status`, `/new`, `/compact`, `/model`, `/usage`, `/think`, `/failover`, `/plugins`
- `/status` → active sessions, current model, uptime, memory DB size
- `/new` → create new thread (new session ID with `-branch-N` suffix)
- `/compact` → trigger context pruning (placeholder for Phase 2)
- Already planned: `/model`, `/usage`, `/think`, `/failover`

#### 9. Thinking Levels
- Add `thinking_level` field to session settings
- Create [src/thinking.ts](src/thinking.ts) with prompt templates for off/low/medium/high
- Low: Basic reasoning in system prompt
- Medium: Prepend "Think step by step" to user message
- High: Use chain-of-thought XML format `<thinking>...</thinking>` in system prompt
- Add `/think <level>` command
- Inject thinking prompt in [src/agent.ts](src/agent.ts) before LLM call

#### 10. Usage Tracking
- Create [src/usage.ts](src/usage.ts) with SQLite table: `usage(id, timestamp, session_id, model, prompt_tokens, completion_tokens, cost, latency_ms)`
- Hook into LLM provider responses (all providers return token counts)
- Add pricing map: [src/llm/pricing.ts](src/llm/pricing.ts) with per-model costs
- Calculate cost: `(prompt_tokens * input_price + completion_tokens * output_price) / 1M`
- Add `/usage` command: total tokens, cost, calls (today, this week, all-time)
- Add `/usage detail` for per-session breakdown

---

### **PHASE 2: Memory System Expansion (6 features)**

#### 11. Context Pruning
- Create [src/memory/pruning.ts](src/memory/pruning.ts)
- Detect when conversation > 80% of model context window (lookup from [src/llm/pricing.ts](src/llm/pricing.ts))
- Use LLM to summarize older messages (keep last 5 exchanges, summarize rest)
- Store summary as system message in history
- Trigger automatically in [src/agent.ts](src/agent.ts) before LLM call
- Manual trigger: `/compact` command

#### 12. Markdown Memory
- Create [memory-files/](memory-files/) directory
- Create [src/memory/markdown.ts](src/memory/markdown.ts)
- Store facts/preferences as `memory-files/<session-id>/facts.md`
- Tool: `save_fact(category, fact)` appends to markdown file
- Tool: `recall_facts(query)` searches markdown files (simple grep)
- Load all facts for session into system prompt as context
- Git-friendly, human-editable

#### 13. Knowledge Graph
- Install `npm install neo4j-driver` or use SQLite with adjacency table
- Create [src/memory/graph.ts](src/memory/graph.ts)
- Tables: `entities(id, name, type)`, `relationships(id, from_id, to_id, relation_type, metadata)`
- Tool: `save_entity(name, type, properties)` → insert/update entity
- Tool: `save_relationship(entity1, relation, entity2)` → create edge
- Tool: `query_graph(entity, depth)` → traverse relationships
- Visualize with Mermaid in `/graph` command

#### 14. Multimodal Memory
- Extend SQLite schema: add `attachments` table with `(id, session_id, type, url, base64_data, extracted_text)`
- Support image analysis: use GPT-4 Vision or Gemini Pro Vision to extract text/descriptions
- Store extracted text in `extracted_text` column
- Tool: `search_attachments(query)` searches extracted text
- Load recent attachments into system context (send image URLs to vision models)

#### 15. Self-Evolving Memory
- Create [src/memory/evolution.ts](src/memory/evolution.ts)
- Track access patterns: add `access_count` and `last_accessed` to entities/facts
- Scheduled task (see Phase 6): run daily
  - Merge duplicate facts (cosine similarity > 0.9 using simple embeddings)
  - Delete facts not accessed in 90 days with low importance
  - Reorganize categories (LLM suggests better groupings)
- Log evolution events to [logs/memory-evolution.log](logs/memory-evolution.log)

#### 16. Supabase + pgvector
- Sign up for Supabase (free tier), create project
- Install `npm install @supabase/supabase-js`
- Create [src/memory/supabase.ts](src/memory/supabase.ts)
- Create Supabase table: `sessions(id, user_id, channel_id, chat_id, created_at, metadata, embedding)`
- Create `messages(id, session_id, role, content, timestamp, embedding)`
- Generate embeddings: use OpenAI `text-embedding-3-small` or local Transformers.js
- Tool: `search_memory_semantic(query, limit)` → pgvector similarity search
- Sync SQLite → Supabase on new messages (async, non-blocking)
- Add `SUPABASE_URL` and `SUPABASE_KEY` to [src/config.ts](src/config.ts)

---

### **PHASE 3: Voice & Speech (6 features)**

#### 17. Voice Transcription
- Use OpenAI Whisper API (already have OpenAI SDK)
- Create [src/voice/transcription.ts](src/voice/transcription.ts)
- Tool: `transcribe_audio(file_path)` → text
- Handle Telegram voice messages in [src/channels/telegram.ts](src/channels/telegram.ts): download file → transcribe → process
- Handle WhatsApp voice messages in [src/channels/whatsapp.ts](src/channels/whatsapp.ts) similarly
- Store transcriptions in `attachments` table with type='audio'

#### 18. Text-to-Speech (OpenAI)
- Create [src/voice/tts.ts](src/voice/tts.ts)
- Use OpenAI TTS API (`tts-1` model, `alloy` voice)
- Function: `textToSpeech(text) → Buffer` (returns MP3)
- Add `/tts enable|disable` command per session
- When TTS enabled, convert all text responses → audio → send as voice message

#### 19. ElevenLabs Voice
- Sign up for ElevenLabs (free tier: 10k characters/month)
- Install `npm install elevenlabs`
- Create [src/voice/elevenlabs.ts](src/voice/elevenlabs.ts)
- Add `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` to [src/config.ts](src/config.ts)
- Function: `elevenLabsTTS(text) → Buffer`
- Update [src/voice/tts.ts](src/voice/tts.ts) to support provider switching (`/tts provider openai|elevenlabs`)
- Stream audio for long responses (chunk text, stream audio)

#### 20. Telegram Voice Messages (Full Integration)
- Combine transcription + TTS in [src/channels/telegram.ts](src/channels/telegram.ts)
- On receiving voice message: download → transcribe → process with LLM → generate TTS → reply with voice
- Add session setting `voice_mode` (off/transcribe-only/full-voice)
- `/voice mode <off|transcribe|full>` command

#### 21. Voice Wake Word
- Install `npm install node-record-lpcm16 @tensorflow-models/speech-commands`
- Create [src/voice/wake-word.ts](src/voice/wake-word.ts)
- Use TensorFlow.js Speech Commands model (runs locally)
- Listen for custom wake phrase: "Hey Claw" or user-configurable
- Start recording on detection → transcribe → process
- Requires microphone access (desktop only, not supported on Telegram/WhatsApp servers)
- Implementation note: This feature needs local environment, not VPS

#### 22. Talk Mode
- Create [src/voice/talk-mode.ts](src/voice/talk-mode.ts)
- Mode: continuous voice conversation (wake word → record → transcribe → LLM → TTS → speak)
- Add `/talk start|stop` command
- Loop: wait for wake word → record until silence (VAD: Voice Activity Detection) → transcribe → send to LLM → TTS → speak response
- Use `@tensorflow-models/speech-commands` for VAD
- Desktop/mobile only (requires mic + speaker)

---

### **PHASE 4: Tools Expansion (7 features)**

#### 23. File Operations
- Create [src/tools/files.ts](src/tools/files.ts)
- Tools: `read_file(path)`, `write_file(path, content)`, `list_files(directory)`, `delete_file(path)`, `search_files(pattern, directory)`
- Add PATH_ALLOWLIST to [src/config.ts](src/config.ts) (default: workspace dir only)
- Block access to system directories, `.env`, auth files
- Add confirmation gate for delete operations
- Max file size: 10MB read, 5MB write

#### 24. Web Search
- Install `npm install axios cheerio`
- Create [src/tools/search.ts](src/tools/search.ts)
- Option 1: Use SerpAPI (requires API key, $50/month for 5k searches)
- Option 2: Use DuckDuckGo HTML scraping (free but rate-limited)
- Option 3: Use Brave Search API (free tier: 2k queries/month)
- Tool: `web_search(query, num_results)` → array of {title, url, snippet}
- Add `SEARCH_PROVIDER` and API key to [src/config.ts](src/config.ts)
- Cache results for 1 hour

#### 25. Browser Automation
- Install `npm install playwright` (chromium included)
- Create [src/tools/browser.ts](src/tools/browser.ts)
- Tools: `browser_navigate(url)`, `browser_screenshot(url)`, `browser_click(selector)`, `browser_type(selector, text)`, `browser_extract(url, selector)`
- Launch headless browser, maintain session context
- Tool: `browser_close()` to clean up
- Timeout: 30s per operation
- CAPTCHA/login handling: require manual intervention

#### 26. Scheduled Tasks (Cron)
- Install `npm install node-cron`
- Create [src/scheduler/index.ts](src/scheduler/index.ts)
- SQLite table: `scheduled_tasks(id, name, cron_expression, session_id, prompt, enabled, last_run, next_run)`
- Tool: `schedule_task(name, cron_or_natural_language, prompt)`
- Parse natural language: "every day at 9am", "every Monday" → cron using simple regex
- Tool: `list_tasks()`, `pause_task(id)`, `delete_task(id)`
- Execute: on cron trigger, send prompt to agent in background, post result to channel
- Add `/tasks` command for management UI

#### 27. Webhook Triggers
- Create [src/webhooks/index.ts](src/webhooks/index.ts)
- Add POST endpoint: `/webhook/:session_id/:hook_name` in [src/server.ts](src/server.ts)
- Parse JSON/form payloads, forward to agent as system message
- Tool: `create_webhook(name)` → returns URL
- Tool: `list_webhooks()`, `delete_webhook(id)`
- Store in SQLite: `webhooks(id, session_id, name, url, secret, created_at)`
- Add HMAC signature verification (optional secret)

#### 28. MCP Tool Bridge
- Create [src/mcp/](src/mcp/) directory
- Create [mcp-servers.json](mcp-servers.json) config file: array of {name, command, args, env}
- Create [src/mcp/client.ts](src/mcp/client.ts)
- Implement MCP protocol: spawn process (stdio), send JSON-RPC messages
- On startup: connect to each server, call `tools/list` → register tools
- On tool call: route to appropriate MCP server via `tools/call`
- Handle SSE transport for HTTP-based servers
- Map MCP tool schema → OpenAI tool schema

#### 29. Skills System
- Create [skills/](skills/) directory
- Skill format: Markdown file with frontmatter
```markdown
---
name: weather
description: Check weather forecast
tools:
  - name: get_weather
    params: [location]
---
# Weather Skill
Implementation: Call OpenWeather API...
```
- Create [src/skills/loader.ts](src/skills/loader.ts)
- Parse markdown, extract tool definitions
- For simple skills: execute inline bash/Python from markdown
- For complex skills: delegate to MCP servers or implement in TypeScript
- Tool: `load_skill(name)`, `list_skills()`, `disable_skill(name)`

---

### **PHASE 5: Advanced Agent Features (4 features)**

#### 30. Agent Swarms
- Create [src/agents/swarm.ts](src/agents/swarm.ts)
- Define agent roles: researcher, coder, reviewer, summarizer
- Each role has custom system prompt + tool access
- Tool: `spawn_agent(role, task)` → creates child session
- Parent agent orchestrates: decompose task → spawn sub-agents → aggregate results
- Store swarm hierarchy in SQLite: `agent_swarms(id, parent_session, child_session, role, status)`
- Add `/swarm <task>` command

#### 31. Agent-to-Agent Communication
- Extend swarm system with messaging
- Tool: `sessions_list()` → list all active sessions
- Tool: `sessions_history(session_id, limit)` → read other session's history (permission check)
- Tool: `sessions_send(session_id, message)` → send message to another session
- Add permission model: sessions can opt-in to allow reads/writes
- Use cases: research agent findings → pass to writer agent

#### 32. Mesh Workflows
- Create [src/agents/mesh.ts](src/agents/mesh.ts)
- Command: `/mesh <goal>` → decompose into subtasks
- Step 1: LLM generates task DAG (JSON: {tasks: [{id, desc, depends_on}]})
- Step 2: Validate DAG (no cycles)
- Step 3: Execute tasks in topological order
- Each task runs in isolated session
- Progress updates sent to user channel
- Store workflow state in SQLite: `workflows(id, goal, tasks_json, status, progress)`

#### 33. Air-Gapped Mode
- Add `AIR_GAPPED=true` to [src/config.ts](src/config.ts)
- When enabled:
  - Force `LLM_PROVIDER=ollama` (local models only)
  - Disable all external APIs (OpenRouter, ElevenLabs, SerpAPI, etc.)
  - Disable outbound HTTP in tools (web search, browser)
  - Use local Whisper models (whisper.cpp)
  - Use local TTS (piper-tts or espeak)
- Install Ollama: `ollama serve` required
- Document local model setup in README

---

### **PHASE 6: Proactive Behaviors (3 features)**

#### 34. Heartbeat System
- Create [src/heartbeat/index.ts](src/heartbeat/index.ts)
- Configurable interval (default: 1 hour)
- On each heartbeat:
  - Check for new emails (if email tools added later)
  - Check for task deadlines (if calendar integrated)
  - Run user-defined heartbeat prompts
- Tool: `set_heartbeat_prompt(schedule, prompt)`
- Store: `heartbeat_tasks(id, session_id, interval_minutes, prompt, last_run)`
- Send proactive messages only if something noteworthy detected
- Add `/heartbeat status` and `/heartbeat enable|disable` commands

#### 35. Evening Recap
- Special scheduled task: runs at 8 PM daily (configurable)
- Prompt template: "Summarize today's conversations, tasks completed, and pending items"
- Queries usage DB for today's stats
- Queries scheduled tasks for incomplete items
- Formats as markdown report, sends to user
- Add `/recap now` for manual trigger

#### 36. Smart Recommendations
- Create [src/recommendations/index.ts](src/recommendations/index.ts)
- Track behavior patterns: command frequency, tool usage, common queries
- Scheduled task: daily analysis
- LLM prompt: "Based on usage patterns, suggest 3 actions the user might want"
- Examples: "You often check weather at 7am, should I schedule it?", "You haven't backed up memories in a week"
- Send as proactive message (max 1/day to avoid spam)
- User can dismiss recommendations: `/recommendations off`

---

### **PHASE 7: UX Enhancements (2 features)**

#### 37. Live Canvas
- Create [src/canvas/index.ts](src/canvas/index.ts)
- WebSocket extension to [src/server.ts](src/server.ts)
- Tool: `canvas_push(html, js)` → send interactive widget to web client
- Web client: [public/canvas.html](public/canvas.html) with iframe sandbox
- Use cases: render charts (Chart.js), tables (Tabulator), forms (HTML5)
- Support A2UI protocol: agent generates UI → user interacts → agent updates
- Security: sandbox iframes, CSP headers

#### 38. Group Management
- Extend [src/channels/telegram.ts](src/channels/telegram.ts) for group chats
- Only respond when bot is mentioned (`@GravityClawBot`)
- Per-group isolated memory: session ID includes group ID
- Admin-only commands: detect via Telegram `getChatMember` API
- Restrict dangerous tools (shell, file ops) to admin commands
- Add `/group settings` for per-group configuration (voice mode, thinking level, etc.)
- Implement same for WhatsApp groups in [src/channels/whatsapp.ts](src/channels/whatsapp.ts)

---

### **PHASE 8: Platform Extensions (1 feature)**

#### 39. iOS & Android Gateway
- Create companion mobile app architecture
- Approach: Build REST API gateway in [src/mobile-gateway/](src/mobile-gateway/)
- New endpoints: `/api/camera/capture`, `/api/gps/location`, `/api/screen/record`, `/api/push/send`
- Mobile app (Flutter/React Native - separate project):
  - Connects to agent via WebSocket
  - Exposes device capabilities as HTTP endpoints
  - Agent calls mobile gateway APIs when needed
- Tools: `mobile_camera()`, `mobile_gps()`, `mobile_notification(message)`
- Authentication: device pairing via QR code + JWT tokens
- Store paired devices: `mobile_devices(id, session_id, device_id, token, last_seen)`
- Document mobile app build instructions (out of scope for agent itself)

---

## **Verification**

### **Per-Phase Testing**
- Each feature includes unit tests in [src/\_\_tests\_\_/](src/__tests__/)
- Integration tests: end-to-end message flow with tool calls
- Run `npm test` after every feature implementation
- Target coverage: >80% for business logic

### **Manual Testing Checklist**
1. **Phase 1**: Test `/model anthropic claude-3-5-sonnet`, verify failover with invalid API key
2. **Phase 2**: Test `/compact`, verify memory files created, query knowledge graph
3. **Phase 3**: Send voice message, receive TTS response, test wake word locally
4. **Phase 4**: Test file read/write, web search, browser screenshot, create scheduled task
5. **Phase 5**: Test `/swarm "research quantum computing"`, verify subtask delegation
6. **Phase 6**: Enable heartbeat, wait for proactive message, trigger `/recap now`
7. **Phase 7**: Test Live Canvas chart rendering, add bot to Telegram group and test mention handling
8. **Phase 8**: Pair mobile device, test camera/GPS tools

### **Smoke Tests**
- All existing channels (Telegram, WhatsApp, WebChat) still functional
- Memory persistence across restarts
- No regressions in core agentic loop

### **Performance Tests**
- Large conversation (500+ messages): context pruning should activate
- Concurrent requests: 10 simultaneous messages should not crash
- Voice transcription: <5s latency for 1-minute audio

---

## **Decisions**

### **LLM Provider Architecture**
- Chose trait-based abstraction over adapter pattern for flexibility
- Failover list ordered by reliability (OpenAI → Anthropic → OpenRouter)
- Ollama for local models instead of llama.cpp (easier API)

### **Memory Strategy**
- SQLite as primary store (single file, simple, fast)
- Supabase as optional sync layer (cross-device, semantic search)
- Markdown memory for human readability (power users can edit directly)
- Knowledge graph in SQLite (avoiding Neo4j dependency for now)

### **Voice Local vs Cloud**
- Whisper API (cloud) for transcription (OpenAI cheaper than local GPU)
- ElevenLabs (cloud) for TTS (quality >> local options)
- Wake Word local (TensorFlow.js, no privacy concerns)
- Air-gapped mode uses whisper.cpp + piper-tts (documented setup)

### **MCP Implementation**
- Stdio transport (simplest, most compatible)
- SSE support for HTTP servers (future webhooks)
- No WebSocket MCP (over-complex for V1)

### **Mobile Architecture**
- Gateway API instead of embedding agent in mobile app
- Keeps agent logic centralized
- Mobile app is thin client + device API bridge
- Reduces mobile app complexity

### **Plugin System Design**
- Trait-based (Provider, Channel, Tool, Memory) not full plugin sandbox
- Plugins run in same process (simpler, no IPC overhead)
- Future: isolate plugins in child processes for security

### **Testing Philosophy**
- Unit tests for business logic (LLM providers, memory, tools)
- Integration tests for channel message flows
- Manual tests for UX flows (too complex to automate)
- Skip E2E tests for external APIs (use mocks)

---

## **Summary**

This plan is ready for implementation. Each phase builds on previous phases, with clear file paths, architectural patterns, and test requirements. Estimated timeline: **8-10 weeks** for one developer working full-time, implementing 38 new features (8 features already complete) to transform Gravity Claw from a Level 1 foundation into a comprehensive AI agent with multi-provider LLM support, advanced memory systems, voice capabilities, extensive tool integrations, swarm intelligence, proactive behaviors, and cross-platform support.
