#!/usr/bin/env node
/**
 * DAG Scheduler for Orchestrate Standalone
 *
 * Implements Kahn's algorithm for topological sorting and layer creation
 * for parallel task execution.
 *
 * @TASK orchestrate-standalone
 * @SPEC SKILL.md
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const os = require('os');

// ---------------------------------------------------------------------------
// Task Parsing
// ---------------------------------------------------------------------------

/**
 * Parse TASKS.md and extract tasks with metadata
 */
function parseTasks(tasksPath) {
  const content = fs.readFileSync(tasksPath, 'utf8');
  const tasks = [];
  const taskRegex = /-\s*\[[ x]\]\s+([A-Z]\d+(?:\.\d+)*):\s*(.+?)(?:\n\s{2,}-(.+?))*$/gm;

  let match;
  while ((match = taskRegex.exec(content)) !== null) {
    const taskId = match[1];
    const description = match[2].trim();
    const metadataStr = match[3] || '';

    // Parse metadata
    const metadata = parseMetadata(metadataStr);

    tasks.push({
      id: taskId,
      description,
      deps: metadata.deps || [],
      domain: metadata.domain || null,
      risk: metadata.risk || 'low',
      files: metadata.files || [],
      owner: metadata.owner || null,
      model: metadata.model || 'sonnet',
      status: 'pending'
    });
  }

  return tasks;
}

/**
 * Parse task metadata from YAML-like format
 */
function parseMetadata(metaStr) {
  const metadata = {
    deps: [],
    domain: null,
    risk: 'low',
    files: [],
    owner: null,
    model: 'sonnet'
  };

  const depsMatch = metaStr.match(/deps:\s*\[(.+?)\]/);
  if (depsMatch) {
    metadata.deps = depsMatch[1].split(',').map(s => s.trim()).filter(Boolean);
  }

  const domainMatch = metaStr.match(/domain:\s*(\w+)/);
  if (domainMatch) metadata.domain = domainMatch[1];

  const riskMatch = metaStr.match(/risk:\s*(\w+)/);
  if (riskMatch) metadata.risk = riskMatch[1];

  const filesMatch = metaStr.match(/files:\s*(.+)/);
  if (filesMatch) {
    metadata.files = filesMatch[1].split(',').map(s => s.trim()).filter(Boolean);
  }

  const ownerMatch = metaStr.match(/owner:\s*(.+)/);
  if (ownerMatch) metadata.owner = ownerMatch[1];

  const modelMatch = metaStr.match(/model:\s*(\w+)/);
  if (modelMatch) metadata.model = modelMatch[1];

  return metadata;
}

// ---------------------------------------------------------------------------
// DAG Building (Kahn's Algorithm)
// ---------------------------------------------------------------------------

/**
 * Build dependency graph and return sorted tasks
 */
function buildDAG(tasks) {
  // Build adjacency list and in-degree count
  const graph = {};
  const inDegree = {};

  for (const task of tasks) {
    graph[task.id] = [];
    inDegree[task.id] = 0;
  }

  for (const task of tasks) {
    for (const dep of task.deps) {
      if (graph[dep]) {
        graph[dep].push(task.id);
      }
      inDegree[task.id] = (inDegree[task.id] || 0) + 1;
    }
  }

  // Kahn's algorithm for topological sort
  const sorted = [];
  const queue = tasks.filter(t => inDegree[t.id] === 0);

  while (queue.length > 0) {
    const current = queue.shift();
    sorted.push(current);

    // Reduce in-degree for dependent tasks
    for (const dependentId of graph[current.id]) {
      inDegree[dependentId]--;
      if (inDegree[dependentId] === 0) {
        const dependent = tasks.find(t => t.id === dependentId);
        if (dependent) queue.push(dependent);
      }
    }
  }

  // Check for cycles
  if (sorted.length !== tasks.length) {
    throw new Error('Circular dependency detected in tasks');
  }

  return { sorted, graph };
}

// ---------------------------------------------------------------------------
// Layer Creation for Parallel Execution
// ---------------------------------------------------------------------------

/**
 * Create execution layers based on dependencies
 */
function createLayers(sortedTasks, graph) {
  const layers = [];
  const placed = new Set();

  for (const task of sortedTasks) {
    const deps = graph[task.id] || [];

    // Find the first layer where all dependencies are placed
    let layerIndex = 0;
    for (const layer of layers) {
      if (deps.every(d => placed.has(d))) {
        // Found layer, but check for conflicts
        if (!hasConflicts(task, layer)) {
          break;
        }
      }
      layerIndex++;
    }

    if (layerIndex >= layers.length) {
      layers.push([]);
    }
    layers[layerIndex].push(task);
    placed.add(task.id);
  }

  return layers;
}

/**
 * Check if task conflicts with any task in the layer
 */
function hasConflicts(task, layer) {
  for (const other of layer) {
    // File conflict
    for (const f1 of task.files) {
      for (const f2 of other.files) {
        if (f1 === f2 || f1.includes('*') && f2.match(f1.replace('*', '.*'))) {
          return true;
        }
      }
    }

    // Domain conflict (if same domain)
    if (task.domain && task.domain === other.domain) {
      return true;
    }

    // Critical risk tasks always conflict (serial execution)
    if (task.risk === 'critical' || other.risk === 'critical') {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Conflict Detection
// ---------------------------------------------------------------------------

/**
 * Detect file and domain conflicts
 */
function detectConflicts(tasks) {
  const fileMap = {};
  const domainMap = {};

  for (const task of tasks) {
    // File conflicts
    for (const file of task.files) {
      if (!fileMap[file]) fileMap[file] = [];
      fileMap[file].push(task.id);
    }

    // Domain conflicts
    if (task.domain) {
      if (!domainMap[task.domain]) domainMap[task.domain] = [];
      domainMap[task.domain].push(task.id);
    }
  }

  return { fileMap, domainMap };
}

// ---------------------------------------------------------------------------
// Wave-based Scheduling (Hybrid Wave Architecture v2.0)
// ---------------------------------------------------------------------------

/**
 * Create waves for Hybrid Wave Architecture
 * Each wave contains 20-40 tasks grouped by domain
 *
 * @param {Array} sortedTasks - Topologically sorted tasks
 * @param {number} waveSize - Target tasks per wave (default: 30)
 * @returns {Array} Array of waves, each containing domain-grouped tasks
 */
function createWaves(sortedTasks, waveSize = 30) {
  const waves = [];
  let currentWave = { tasks: [], domains: {} };
  let taskCount = 0;

  for (const task of sortedTasks) {
    const domain = task.domain || 'shared';

    // Initialize domain in current wave if not exists
    if (!currentWave.domains[domain]) {
      currentWave.domains[domain] = [];
    }

    currentWave.domains[domain].push(task);
    currentWave.tasks.push(task);
    taskCount++;

    // Start new wave when size reached
    if (taskCount >= waveSize) {
      waves.push(currentWave);
      currentWave = { tasks: [], domains: {} };
      taskCount = 0;
    }
  }

  // Add remaining tasks as final wave
  if (currentWave.tasks.length > 0) {
    waves.push(currentWave);
  }

  return waves;
}

/**
 * Create Wave execution plan with phases
 *
 * Phase 0: Contract generation (single agent)
 * Phase 1: Domain parallelism with mid-wave validation
 * Phase 2: Cross-review gate
 * Phase 3: Integration & polish
 */
function createWavePlan(tasks, options = {}) {
  const { waveSize = 30 } = options;
  const { sorted } = buildDAG(tasks);
  const waves = createWaves(sorted, waveSize);

  // Identify domains
  const domains = [...new Set(tasks.map(t => t.domain || 'shared'))];

  return {
    mode: 'wave',
    phases: [
      {
        id: 0,
        name: 'Shared Foundation',
        description: 'Generate contracts (API, Type, Design, Domain)',
        agent: 'single',
        tasks: ['Generate contracts from templates/contract-first.yaml'],
        validation: ['contract files exist', 'all domains defined']
      },
      {
        id: 1,
        name: 'Domain Parallelism',
        description: 'Execute waves with domain-parallel agents',
        agent: 'multi',
        waves: waves.map((wave, i) => ({
          id: i + 1,
          taskCount: wave.tasks.length,
          domains: Object.keys(wave.domains),
          midValidation: i < waves.length - 1  // Mid-wave validation except last
        })),
        validation: ['contract compliance', 'no duplicate utils']
      },
      {
        id: 2,
        name: 'Cross-Review Gate',
        description: 'Each domain agent reviews other domains',
        agent: 'multi',
        reviews: domains.map(d => ({
          reviewer: d,
          targets: domains.filter(t => t !== d)
        })),
        validation: ['cross-domain review passed', 'integration tests']
      },
      {
        id: 3,
        name: 'Integration & Polish',
        description: 'Merge common modules, final quality audit',
        agent: 'single',
        tasks: ['Deduplicate utils', 'Run /quality-auditor'],
        validation: ['full test suite', 'security scan']
      }
    ],
    summary: {
      totalTasks: tasks.length,
      totalWaves: waves.length,
      domains,
      estimatedParallelism: domains.length
    }
  };
}

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------

if (require.main === module) {
  const tasksPath = process.argv[2] || 'TASKS.md';
  const mode = process.argv[3] || 'standard';  // standard | wave
  const waveSize = parseInt(process.argv[4]) || 30;

  try {
    const tasks = parseTasks(tasksPath);
    console.log(`Parsed ${tasks.length} tasks`);

    if (mode === 'wave') {
      // Wave mode (Hybrid Wave Architecture)
      console.log(`\n🌊 Wave Mode (size: ${waveSize})`);
      const plan = createWavePlan(tasks, { waveSize });

      console.log(`\nPhases:`);
      for (const phase of plan.phases) {
        console.log(`  Phase ${phase.id}: ${phase.name} (${phase.agent} agent)`);
        if (phase.waves) {
          phase.waves.forEach(w => {
            console.log(`    Wave ${w.id}: ${w.taskCount} tasks [${w.domains.join(', ')}]`);
          });
        }
      }

      console.log(`\nSummary:`);
      console.log(`  Total tasks: ${plan.summary.totalTasks}`);
      console.log(`  Total waves: ${plan.summary.totalWaves}`);
      console.log(`  Domains: ${plan.summary.domains.join(', ')}`);
      console.log(`  Estimated parallelism: ${plan.summary.estimatedParallelism}x`);

      // Output wave plan
      const outputPath = path.join(path.dirname(tasksPath), '.claude', 'wave-plan.json');
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, JSON.stringify(plan, null, 2));
      console.log(`\nWave plan written to: ${outputPath}`);

    } else {
      // Standard mode (legacy)
      const { sorted, graph } = buildDAG(tasks);
      console.log(`Topological sort: ${sorted.map(t => t.id).join(' -> ')}`);

      const layers = createLayers(sorted, graph);
      console.log(`\nExecution layers: ${layers.length}`);
      layers.forEach((layer, i) => {
        console.log(`  Layer ${i + 1}: ${layer.map(t => t.id).join(', ')}`);
      });

      const conflicts = detectConflicts(tasks);
      console.log(`\nConflicts detected: ${Object.keys(conflicts.fileMap).length} files, ${Object.keys(conflicts.domainMap).length} domains`);

      // Output layers as JSON for orchestrate.sh
      const outputPath = path.join(path.dirname(tasksPath), '.claude', 'task-layers.json');
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, JSON.stringify({ layers, tasks: sorted }, null, 2));
      console.log(`\nLayers written to: ${outputPath}`);
    }

  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// CLI Routing Functions
async function checkCLI(command) {
  return new Promise((resolve) => {
    exec(`command -v ${command}`, (error, stdout, stderr) => {
      resolve(!error);
    });
  });
}

async function runExternalCLI(command, task) {
  return new Promise((resolve, reject) => {
    const taskArg = command.includes('gemini') ? '--model gemini-2.0-flash-preview' : '';
    const child = exec(command, [taskArg, task.description], {
      maxBuffer: 1024 * 1024
    });

    let output = '';
    child.stdout.on('data', (data) => {
      output += data.toString();
    });
    child.stderr.on('data', (data) => {
      output += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, output });
      } else {
        reject(new Error(`CLI failed with code ${code}: ${output}`));
      }
    });
  });
}

/**
 * Load model routing configuration
 */
function loadModelRouting() {
  const routingPath = path.join(process.cwd(), '.claude', 'model-routing.yaml');
  const globalRoutingPath = path.join(os.homedir(), '.claude', 'model-routing.yaml');


  // Try local first, then global
  for (const p of [routingPath, globalRoutingPath]) {
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, 'utf8');
        return YAML.parse(content);
      } catch (error) {
        console.warn(`Failed to parse ${p}: ${error.message}`);
      }
    }
  }
  return null;
}

/**
 * Get CLI command for agent
 */
function getCLICommandForAgent(agentName) {
  const routing = loadModelRouting();
  if (!routing) return null;

  // Direct match
  if (routing.routing && routing.routing[agentName]) {
    return routing.routing[agentName];
  }

  // Wildcard match
  for (const pattern of Object.keys(routing.routing)) {
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace('*', '.*') + '$');
      if (regex.test(agentName)) {
        return routing.routing[pattern];
      }
    }
  }

  return null;
}

/**
 * Execute task with CLI routing
 */
async function executeWithCLI(agent, task) {
  const cliCommand = agent.cli_command || getCLICommandForAgent(agent.name);

  // No CLI command configured
  if (!cliCommand) {
    return null;
  }

  // Check if CLI exists
  const cliExists = await checkCLI(cliCommand.split(' ')[0]);
  if (!cliExists) {
    console.warn(`CLI not found: ${cliCommand}`);
    return null;
  }

  // Execute with CLI
  try {
    const result = await runExternalCLI(cliCommand, task);
    return result;
  } catch (error) {
    console.error(`CLI execution failed: ${error.message}`);

    // Try fallback
    if (agent.cli_fallback) {
      return await executeWithFallback(agent, task);
    }

    throw error;
  }
}

/**
 * Fallback execution (MCP or then Claude)
 */
async function executeWithFallback(agent, task) {
  // Try MCP fallback
  if (agent.mcp && agent.mcp.length > 0) {
    for (const mcp of agent.mcp) {
      if (mcp === 'gemini') {
        console.log(`Falling back to Gemini MCP`);
        // MCP call would be handled by the caller
        return { useMCP: true, source: 'mcp' };
      }
    }
  }

  // Claude direct execution
  console.log('Falling back to Claude direct execution');
  return { model: 'claude', description: task.description };
}

/**
 * Smart execution: CLI -> MCP -> Claude
 */
async function smartExecute(agent, task) {
  // Try CLI first
  const cliResult = await executeWithCLI(agent, task);

  if (cliResult) {
    return cliResult;
  }

  // Try fallback
  return await executeWithFallback(agent, task);
}

// YAML parser (simple)
function parseSimpleYAML(content) {
  const result = {};
  const lines = content.split('\n');
  let currentKey = null;
  let currentValue = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || trimmed === '') continue;

    if (trimmed.includes(':')) {
      if (currentKey) {
        result[currentKey] = currentValue.join('\n');
      }
      currentKey = trimmed.slice(0, -1).trim();
      currentValue = [];
    } else if (currentKey) {
      currentValue.push(trimmed);
    }
  }

  if (currentKey) {
    result[currentKey] = currentValue.join('\n');
  }

  return result;
}


module.exports = {
  parseTasks,
  buildDAG,
  createLayers,
  detectConflicts,
  createWaves,
  createWavePlan,
  // CLI Routing exports
  checkCLI,
  runExternalCLI,
  loadModelRouting,
  getCLICommandForAgent,
  executeWithCLI,
  executeWithFallback,
  smartExecute
};
