/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */
import fs from 'node:fs';
import path from 'node:path';
import { getSystemInfo } from './system-info.js';

const resultsDir = new URL('../results/', import.meta.url).pathname;

/**
 * Compute statistics from an array of request results.
 * Each result should have { elapsed, error? }
 */
export function computeStats (results, durationMs) {
  const successful = results.filter(r => !r.error);
  const failed = results.filter(r => r.error);
  const latencies = successful.map(r => r.elapsed).sort((a, b) => a - b);

  const durationS = durationMs / 1000;

  return {
    totalRequests: results.length,
    successfulRequests: successful.length,
    failedRequests: failed.length,
    requestsPerSecond: +(successful.length / durationS).toFixed(2),
    latency: latencies.length > 0
      ? {
          min: +latencies[0].toFixed(2),
          p50: +percentile(latencies, 50).toFixed(2),
          p95: +percentile(latencies, 95).toFixed(2),
          p99: +percentile(latencies, 99).toFixed(2),
          max: +latencies[latencies.length - 1].toFixed(2),
          avg: +(latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2)
        }
      : null,
    errors: summarizeErrors(failed)
  };
}

function percentile (sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function summarizeErrors (failed) {
  if (failed.length === 0) return {};
  const counts = {};
  for (const r of failed) {
    const key = r.error || 'unknown';
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

/**
 * Write a single combined result file (JSON + markdown) for an entire scenario run.
 * `entries` is an array of { subScenario, stats, extra }.
 */
export function writeScenarioResult (config, scenario, entries, resources) {
  const system = getSystemInfo();
  const ts = new Date().toISOString();
  const label = config.label || `c${config.concurrency}-d${config.duration}`;

  const result = {
    meta: {
      timestamp: ts,
      scenario,
      label,
      duration: config.duration,
      concurrency: config.concurrency
    },
    system,
    config: {
      target: config.target,
      profile: config.profile || null,
      ...config.serverConfig
    },
    runs: entries.map(e => ({
      subScenario: e.subScenario,
      ...e.extra,
      results: e.stats
    })),
    resources: resources || null
  };

  const tsSlug = ts.replace(/[:.]/g, '-').slice(0, 19);
  const name = `${tsSlug}-${scenario}-${slugify(label)}`;
  const jsonPath = path.join(resultsDir, name + '.json');
  const mdPath = path.join(resultsDir, name + '.md');

  fs.mkdirSync(resultsDir, { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2) + '\n');
  fs.writeFileSync(mdPath, toSummaryMarkdown(result) + '\n');

  return { jsonPath, mdPath };
}

function slugify (s) {
  return s.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

function toSummaryMarkdown (result) {
  const { meta, system, runs } = result;
  const lines = [];

  lines.push(`# Benchmark: ${meta.scenario}`);
  lines.push('');
  lines.push(`**Date:** ${meta.timestamp}  `);
  lines.push(`**Duration:** ${meta.duration}s | **Concurrency:** ${meta.concurrency}  `);
  lines.push(`**Target:** ${result.config.target} | **Profile:** ${result.config.profile || 'n/a'}`);
  lines.push('');

  // Server config (engines, audit, integrity)
  const cfg = result.config;
  lines.push('## Server Config');
  if (cfg.engines) {
    lines.push(`- **Base storage:** ${cfg.engines.base || 'n/a'}`);
    lines.push(`- **Platform storage:** ${cfg.engines.platform || 'n/a'}`);
    lines.push(`- **Series storage:** ${cfg.engines.series || 'n/a'}`);
    lines.push(`- **File storage:** ${cfg.engines.file || 'n/a'}`);
    lines.push(`- **Audit storage:** ${cfg.engines.audit || 'n/a'}`);
  }
  if (cfg.audit != null) lines.push(`- **Audit:** ${cfg.audit ? 'ON' : 'OFF'}`);
  if (cfg.integrity != null) lines.push(`- **Integrity:** ${JSON.stringify(cfg.integrity)}`);
  if (cfg.clusterWorkers != null) lines.push(`- **API workers:** ${cfg.clusterWorkers}`);
  lines.push('');

  lines.push('## System');
  lines.push(`- **CPU:** ${system.cpuModel} (${system.cpuCores} cores)`);
  lines.push(`- **Memory:** ${system.memoryTotal}`);
  lines.push(`- **OS:** ${system.os} (${system.arch})`);
  lines.push(`- **Node:** ${system.nodeVersion}`);
  lines.push(`- **Version:** ${system.version} (${system.gitCommit})`);
  lines.push('');

  // Summary table
  lines.push('## Results');
  lines.push('');
  lines.push('| Sub-scenario | Req/s | p50 (ms) | p95 (ms) | p99 (ms) | max (ms) | OK | Fail |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|');

  for (const run of runs) {
    const s = run.results;
    const lat = s.latency;
    lines.push(`| ${run.subScenario} | ${s.requestsPerSecond} | ${lat?.p50 ?? '-'} | ${lat?.p95 ?? '-'} | ${lat?.p99 ?? '-'} | ${lat?.max ?? '-'} | ${s.successfulRequests} | ${s.failedRequests} |`);
  }
  lines.push('');

  // Errors section (only if any)
  const runsWithErrors = runs.filter(r => r.results.failedRequests > 0);
  if (runsWithErrors.length > 0) {
    lines.push('## Errors');
    lines.push('');
    for (const run of runsWithErrors) {
      lines.push(`### ${run.subScenario}`);
      for (const [msg, count] of Object.entries(run.results.errors)) {
        lines.push(`- ${msg}: ${count}`);
      }
      lines.push('');
    }
  }

  // Resources section
  if (result.resources?.peak) {
    const r = result.resources;
    lines.push(`## Resources (${r.processCount || 'n/a'} processes)`);
    lines.push('');
    lines.push('| Metric | Peak | Avg |');
    lines.push('|--------|------|-----|');
    lines.push(`| RSS (MB) | ${r.peak.rssMb} | ${r.avg.rssMb} |`);
    lines.push(`| CPU (%) | ${r.peak.cpuPercent} | ${r.avg.cpuPercent} |`);
    lines.push(`| Samples | ${r.samples.length} | |`);
    lines.push('');
  }

  lines.push('## Notes');
  lines.push('');
  lines.push('_Add observations here._');

  return lines.join('\n');
}

/**
 * Print a summary table to the console.
 */
export function printScenarioSummary (scenario, entries) {
  console.log(`\n=== ${scenario} ===`);
  const maxName = Math.max(...entries.map(e => e.subScenario.length), 14);
  const hdr = 'Sub-scenario'.padEnd(maxName) + '  Req/s    p50    p95    p99    max   OK   Fail';
  console.log('  ' + hdr);
  console.log('  ' + '─'.repeat(hdr.length));
  for (const e of entries) {
    const s = e.stats;
    const lat = s.latency;
    const row = e.subScenario.padEnd(maxName) +
      String(s.requestsPerSecond).padStart(7) +
      (lat ? String(lat.p50).padStart(7) : '      -') +
      (lat ? String(lat.p95).padStart(7) : '      -') +
      (lat ? String(lat.p99).padStart(7) : '      -') +
      (lat ? String(lat.max).padStart(7) : '      -') +
      String(s.successfulRequests).padStart(5) +
      String(s.failedRequests).padStart(6);
    console.log('  ' + row);
  }
}
