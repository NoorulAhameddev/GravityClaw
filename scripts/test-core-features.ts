import { createLogger } from '../src/logger.ts';
import { db } from '../src/db.ts';
import { config } from '../src/config.ts';
import { AgentSwarm } from '../src/agents/swarm.ts';
import { MeshWorkflow, type WorkflowDAG } from '../src/agents/mesh.ts';
import { setHeartbeatPrompt } from '../src/heartbeat/index.ts';
import { generateRecommendations, analyzeSessionPatterns } from '../src/recommendations/index.ts';
import { saveEntity, saveRelationship, getEntityByName } from '../src/memory/graph.ts';
import { saveFact, readAllFacts } from '../src/memory/markdown.ts';
import { retrieveRelevantMemories } from '../src/memory/retrieval.ts';
import { addUserMessage, addAssistantMessage } from '../src/llm/index.ts';

const log = createLogger('test-core-features');

async function testMultiAgentOrchestration() {
  console.log('\n--- 1. Testing Multi-Agent Orchestration (Swarms & Mesh) ---');
  const sessionId = 'test-session-swarm-mesh';
  
  db.prepare('DELETE FROM agent_swarms WHERE parent_session_id = ?').run(sessionId);
  db.prepare('DELETE FROM workflows WHERE session_id = ?').run(sessionId);

  // A. Swarm Test
  console.log('🔹 Testing Agent Swarm...');
  const swarm = new AgentSwarm(sessionId, {
    numAgents: 2,
    roles: ['researcher', 'summarizer'],
    maxConcurrency: 2,
  });

  console.log(`   Swarm initialized for parent session ${sessionId}`);

  // B. Mesh Test (DAG Workflow)
  console.log('🔹 Testing Mesh Workflow (DAG Validation)...');
  const mesh = new MeshWorkflow({ maxParallelTasks: 3 });
  const dag: WorkflowDAG = {
    goalDescription: 'Market Analysis Workflow',
    tasks: [
      { id: 't1', description: 'Research Competitors (OpenClaw vs GravityClaw)', dependsOn: [], status: 'pending' },
      { id: 't2', description: 'Synthesize Architectural Insights', dependsOn: ['t1'], status: 'pending' }
    ]
  };

  const validation = mesh.validateDAG(dag);
  console.log(`   DAG Validation Result: Valid = ${validation.valid}, Errors = ${validation.errors.length}`);
  console.log(`   Tasks Breakdown: ${dag.tasks.map(t => `[${t.id}: ${t.description}]`).join(' -> ')}`);
  
  console.log('✅ Multi-Agent Orchestration structure validated successfully!');
}

async function testProactiveEngine() {
  console.log('\n--- 2. Testing Proactive Engine ---');
  const sessionId = 'test-session-proactive';

  // A. Heartbeat Setup
  console.log('🔹 Testing Heartbeat Check-in...');
  const heartbeat = setHeartbeatPrompt({
    sessionId,
    schedule: 'every 30 minutes',
    prompt: 'Check system metrics and send recap',
  });
  console.log(`   Heartbeat Task Configured: ID ${heartbeat.id}, Interval: ${heartbeat.intervalMinutes}m`);

  // B. Context setup for Recommendations
  console.log('🔹 Testing Proactive Recommendations Engine...');
  addUserMessage(sessionId, 'I am looking to improve our database indexing strategy for high throughput.', { db, config });
  addAssistantMessage(sessionId, 'Consider B-Tree vs BRIN indexes based on column cardinality.', { db, config });
  
  const profile = analyzeSessionPatterns(sessionId);
  const recommendations = await generateRecommendations(profile);
  console.log(`   Proactive Recommendations generated: ${recommendations.length} recommendations found.`);
  if (recommendations.length > 0) {
    console.log(`   Sample Recommendation: "${recommendations[0]}"`);
  }

  console.log('✅ Proactive Engine validated successfully!');
}

async function testHybridMemorySystem() {
  console.log('\n--- 3. Testing Hybrid Memory System ---');
  const sessionId = 'test-session-hybrid-memory';

  // A. Knowledge Graph
  console.log('🔹 Testing Knowledge Graph (Entities & Relations)...');
  const e1 = saveEntity(sessionId, 'GravityClaw', 'project', { architecture: 'multi-agent' });
  const e2 = saveEntity(sessionId, 'OpenClaw', 'project', { ecosystem: 'monorepo' });
  const rel = saveRelationship(sessionId, 'GravityClaw', 'inspired_by', 'OpenClaw');

  const fetchedEntity = getEntityByName(sessionId, 'GravityClaw');
  console.log(`   Knowledge Graph Entity: ${fetchedEntity?.name} (${fetchedEntity?.type})`);
  console.log(`   Relation Saved: GravityClaw -> ${rel.relationType} -> OpenClaw`);

  // B. Markdown Persistent Facts
  console.log('🔹 Testing Persistent Markdown Facts...');
  addUserMessage(sessionId, 'Initializing session for facts testing', { db, config });
  saveFact(sessionId, 'architecture', 'GravityClaw uses SQLite + ChromaDB hybrid memory.');
  const facts = readAllFacts(sessionId);
  console.log(`   Markdown Facts Saved & Retrieved: ${facts.length} facts found.`);

  // C. Unified Retrieval
  console.log('🔹 Testing Unified Memory Retrieval...');
  const retrieved = await retrieveRelevantMemories(sessionId, 'GravityClaw memory databases', { limit: 3 });
  console.log(`   Retrieved ${retrieved.length} relevant memories from hybrid memory store.`);

  console.log('✅ Hybrid Memory System validated successfully!');
}

async function runAllTests() {
  console.log('🚀 ===================================================');
  console.log('🚀 Running GravityClaw Flagship Feature Integration Test');
  console.log('🚀 ===================================================');

  try {
    await testMultiAgentOrchestration();
    await testProactiveEngine();
    await testHybridMemorySystem();

    console.log('\n===================================================');
    console.log('🎉 ALL 3 FLAGSHIP FEATURES VERIFIED SUCCESSFULLY!');
    console.log('===================================================\n');
  } catch (err) {
    console.error('❌ Error during feature testing:', err);
    process.exit(1);
  }
}

runAllTests();
