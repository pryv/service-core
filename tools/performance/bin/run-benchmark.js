#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { parseConfig } from '../lib/config.js';
import { computeStats, writeScenarioResult, printScenarioSummary } from '../lib/reporter.js';
import { getSystemInfo } from '../lib/system-info.js';
import { readServerConfig } from '../lib/server-config.js';

const scenariosDir = new URL('../scenarios/', import.meta.url).pathname;

async function main () {
  const config = parseConfig(process.argv.slice(2));

  // list available scenarios
  const available = fs.readdirSync(scenariosDir)
    .filter(f => f.endsWith('.js'))
    .map(f => f.replace('.js', ''));

  if (!config.scenario) {
    console.log('Available scenarios:', available.join(', '));
    console.log('Use --scenario <name> to run one, or --matrix to run all.');
    process.exit(1);
  }

  if (!available.includes(config.scenario)) {
    console.error(`Unknown scenario: ${config.scenario}`);
    console.error('Available:', available.join(', '));
    process.exit(1);
  }

  // load seed data
  let seedData = null;
  if (config.seedFile) {
    seedData = JSON.parse(fs.readFileSync(config.seedFile, 'utf8'));
  } else {
    const defaultSeedPath = path.join(scenariosDir, '..', 'datasets', 'seed-result.json');
    if (fs.existsSync(defaultSeedPath)) {
      seedData = JSON.parse(fs.readFileSync(defaultSeedPath, 'utf8'));
    }
  }

  if (!seedData) {
    console.error('No seed data found. Run the seed script first:');
    console.error('  node datasets/seed.js --target <url> --users 5');
    process.exit(1);
  }

  console.log(`Target: ${config.target}`);
  console.log(`Scenario: ${config.scenario}`);
  console.log(`Concurrency: ${config.concurrency} | Duration: ${config.duration}s`);
  console.log(`Users available: ${seedData.users.length}`);

  const system = getSystemInfo();
  console.log(`System: ${system.cpuModel} (${system.cpuCores} cores), ${system.memoryTotal} RAM`);

  // read server config (engines, audit, integrity)
  const serverConfig = readServerConfig();
  config.serverConfig = serverConfig;
  console.log(`Engines: base=${serverConfig.engines.base}, platform=${serverConfig.engines.platform}`);
  console.log(`Audit: ${serverConfig.audit ?? 'n/a'} | Integrity: ${JSON.stringify(serverConfig.integrity) || 'n/a'}`);
  console.log('');

  // import and run scenario
  const scenarioModule = await import(path.join(scenariosDir, config.scenario + '.js'));
  const results = await scenarioModule.run(config, seedData);

  // results can be an array of sub-scenario results or a single result
  const rawRuns = Array.isArray(results) ? results : [results];

  // compute stats for each sub-scenario
  const entries = rawRuns.map(run => ({
    subScenario: run.subScenario || config.scenario,
    stats: computeStats(run.results, config.duration * 1000),
    extra: run.extra || {}
  }));

  // print console summary
  printScenarioSummary(config.scenario, entries);

  // write single combined JSON + markdown
  const paths = writeScenarioResult(config, config.scenario, entries);
  console.log(`\n  Saved: ${paths.jsonPath}`);
  console.log(`         ${paths.mdPath}`);

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
