#!/usr/bin/env node
/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

/**
 * Migrate platform data from single-core (SQLite) to multi-core (rqlite).
 *
 * Reads users and their indexed account fields from the base storage (PG or MongoDB),
 * then inserts the platform records into rqlite:
 * - core-info/{coreId} — this core's metadata
 * - user-core/{username} — maps each user to this core
 * - user-indexed/{field}/{username} — indexed fields (language, email, appId, etc.)
 * - user-unique/email/{email} — email → username reverse index
 *
 * Usage:
 *   node bin/migrate-platform-to-rqlite.js --config /path/to/config.yml --core-id core-a
 *
 * The config must have:
 *   storages.engines.rqlite.url — rqlite HTTP API URL
 *   storages.engines.postgresql (or mongodb) — base storage connection
 *
 * Run this BEFORE switching storages.platform.engine from sqlite to rqlite.
 */

const path = require('path');

// Parse args
const args = process.argv.slice(2);
let configPath = null;
let coreId = null;
let rqliteUrl = null;
let dryRun = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--config' && args[i + 1]) configPath = args[++i];
  else if (args[i] === '--core-id' && args[i + 1]) coreId = args[++i];
  else if (args[i] === '--rqlite-url' && args[i + 1]) rqliteUrl = args[++i];
  else if (args[i] === '--dry-run') dryRun = true;
  else if (args[i] === '--help') { usage(); process.exit(0); }
}

function usage () {
  console.log('Usage: node bin/migrate-platform-to-rqlite.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --config <path>     Config file (default: reads from standard config chain)');
  console.log('  --core-id <id>      Core identifier for this instance (required)');
  console.log('  --rqlite-url <url>  rqlite HTTP API URL (default: from config or http://localhost:4001)');
  console.log('  --dry-run           Show statements without executing');
}

if (!coreId) {
  console.error('Error: --core-id is required');
  usage();
  process.exit(1);
}

const { getConfig } = require('@pryv/boiler').init({
  appName: 'migrate-platform',
  baseFilesDir: path.resolve(__dirname, '..'),
  baseConfigDir: path.resolve(__dirname, '../config/')
});

async function main () {
  const config = await getConfig();
  if (configPath) {
    // Load override config if provided
    const yaml = require('yaml');
    const fs = require('fs');
    const override = yaml.parse(fs.readFileSync(configPath, 'utf8'));
    for (const [k, v] of Object.entries(flattenConfig(override))) {
      config.set(k, v);
    }
  }

  rqliteUrl = rqliteUrl || config.get('storages:engines:rqlite:url') || 'http://localhost:4001';
  console.log(`Core ID: ${coreId}`);
  console.log(`rqlite URL: ${rqliteUrl}`);

  // Initialize storages to get access to the base storage
  const storages = require('storages');
  await storages.init(config);

  // Get all users from the users index
  const usersLocalIndex = require('storage/src/usersLocalIndex');
  await usersLocalIndex.init();
  const usersByUsername = await usersLocalIndex.getAllByUsername();
  const usernames = Object.keys(usersByUsername);
  console.log(`Found ${usernames.length} users in local index`);

  // Build rqlite statements
  const stmts = [];
  stmts.push(['CREATE TABLE IF NOT EXISTS keyValue (key TEXT PRIMARY KEY, value TEXT)']);

  // Core info
  const coreInfo = JSON.stringify({
    id: coreId, ip: null, ipv6: null, cname: null, hosting: null, available: true
  });
  stmts.push(['INSERT OR REPLACE INTO keyValue (key, value) VALUES (?, ?)',
    'core-info/' + coreId, coreInfo]);

  // Process each user
  const mall = storages.mall;
  const indexedFields = ['language', 'email', 'appId', 'invitationToken', 'referer'];

  for (const username of usernames) {
    const userId = usersByUsername[username];

    // user-core mapping
    stmts.push(['INSERT OR REPLACE INTO keyValue (key, value) VALUES (?, ?)',
      'user-core/' + username, coreId]);

    // Read account fields from the mall (account stream events)
    try {
      const accountEvents = await mall.events.get(userId, { streams: [{ any: [':_system:account'] }], limit: 100 });
      for (const event of (accountEvents || [])) {
        const streamId = event.streamIds?.[0];
        if (!streamId) continue;
        const fieldName = streamId.replace(/^:_?system:/, '');
        if (indexedFields.includes(fieldName)) {
          const value = event.content != null ? String(event.content) : '';
          stmts.push(['INSERT OR REPLACE INTO keyValue (key, value) VALUES (?, ?)',
            'user-indexed/' + fieldName + '/' + username, value]);

          if (fieldName === 'email') {
            stmts.push(['INSERT OR REPLACE INTO keyValue (key, value) VALUES (?, ?)',
              'user-unique/email/' + value, username]);
          }
        }
      }
    } catch (e) {
      console.warn(`Warning: could not read account fields for ${username}: ${e.message}`);
    }
  }

  console.log(`Prepared ${stmts.length} rqlite statements`);

  if (dryRun) {
    console.log('\n--- DRY RUN ---');
    for (const s of stmts) {
      console.log(s.length === 1 ? s[0] : `${s[0]} → [${s.slice(1).join(', ')}]`);
    }
    process.exit(0);
  }

  // Execute via rqlite HTTP API
  const body = stmts.map(s => s.length === 1 ? s[0] : s);
  const res = await fetch(rqliteUrl + '/db/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const result = await res.json();
  const errors = result.results.filter(r => r.error);
  if (errors.length > 0) {
    console.error('Errors:', JSON.stringify(errors, null, 2));
    process.exit(1);
  }
  console.log(`Successfully inserted ${stmts.length} records into rqlite`);

  // Verify
  const verify = await fetch(rqliteUrl + '/db/query?q=' + encodeURIComponent('SELECT COUNT(*) FROM keyValue'));
  const vr = await verify.json();
  console.log('rqlite keyValue count:', vr.results[0].values[0][0]);

  process.exit(0);
}

function flattenConfig (obj, prefix) {
  prefix = prefix || '';
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? prefix + ':' + k : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(result, flattenConfig(v, key));
    } else {
      result[key] = v;
    }
  }
  return result;
}

main().catch(e => { console.error('Migration failed:', e); process.exit(1); });
