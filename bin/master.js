#!/usr/bin/env node

/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

// Master process: manages API and HFS workers via Node.js cluster module.
// Replaces runit-based multi-process orchestration.
//
// Usage:
//   node bin/master.js [--config <path>]
//
// Config keys:
//   cluster.apiWorkers  — number of API workers (default: 2)
//   cluster.hfsWorkers  — number of HFS workers (default: 1, 0 = disabled)

const cluster = require('node:cluster');
const path = require('node:path');

if (cluster.isPrimary) {
  const os = require('node:os');

  // Minimal boiler init — just enough to read config
  require('@pryv/boiler').init({
    appName: 'master',
    baseFilesDir: path.resolve(__dirname, '../'),
    baseConfigDir: path.resolve(__dirname, '../components/api-server/config/'),
    extraConfigs: [{
      plugin: require('../components/api-server/config/components/systemStreams')
    }]
  });

  const { getConfig, getLogger } = require('@pryv/boiler');

  (async () => {
    const config = await getConfig();
    const logger = getLogger('master');
    const log = (msg) => { logger.info(msg); console.log(`[master] ${msg}`); };

    // Start TCP pub/sub broker in master (workers connect as clients)
    const tcpPubsub = require('../components/messages/src/tcp_pubsub');
    await tcpPubsub.init();
    log('TCP pub/sub broker started');

    // Track worker types for targeted restart
    const workerTypes = new Map(); // worker.id → 'api' | 'hfs'
    let shuttingDown = false;
    let apiWorkerId = 0;
    let hfsWorkerId = 0;

    // --- API workers ---
    const configuredApiWorkers = config.get('cluster:apiWorkers');
    const numApiWorkers = (configuredApiWorkers != null)
      ? configuredApiWorkers
      : Math.min(os.cpus().length, 4);

    log(`Forking ${numApiWorkers} API worker(s)`);
    for (let i = 0; i < numApiWorkers; i++) {
      forkApiWorker();
    }

    function forkApiWorker () {
      const id = apiWorkerId++;
      const worker = cluster.fork({
        PRYV_WORKER_TYPE: 'api',
        PRYV_BOILER_SUFFIX: `-w${id}`
      });
      workerTypes.set(worker.id, 'api');
      log(`API worker w${id} started (pid ${worker.process.pid})`);
    }

    // --- HFS workers ---
    const numHfsWorkers = config.get('cluster:hfsWorkers') ?? 1;

    if (numHfsWorkers > 0) {
      log(`Forking ${numHfsWorkers} HFS worker(s)`);
      for (let i = 0; i < numHfsWorkers; i++) {
        forkHfsWorker();
      }
    } else {
      log('HFS workers disabled (cluster:hfsWorkers = 0)');
    }

    function forkHfsWorker () {
      const id = hfsWorkerId++;
      const worker = cluster.fork({
        PRYV_WORKER_TYPE: 'hfs',
        PRYV_BOILER_SUFFIX: `-hfs${id}`
      });
      workerTypes.set(worker.id, 'hfs');
      log(`HFS worker hfs${id} started (pid ${worker.process.pid})`);
    }

    // --- Worker lifecycle ---
    cluster.on('exit', (worker, code, signal) => {
      const type = workerTypes.get(worker.id);
      workerTypes.delete(worker.id);
      if (shuttingDown) return;
      log(`${type ?? 'unknown'} worker pid ${worker.process.pid} died (code=${code} signal=${signal}), restarting`);
      if (type === 'hfs') {
        forkHfsWorker();
      } else {
        forkApiWorker();
      }
    });

    const shutdown = (sig) => {
      if (shuttingDown) return;
      shuttingDown = true;
      log(`Received ${sig}, shutting down workers...`);
      for (const id in cluster.workers) {
        cluster.workers[id].process.kill('SIGTERM');
      }
      // Force exit after timeout
      setTimeout(() => {
        log('Shutdown timeout, forcing exit');
        process.exit(1);
      }, 10000).unref();
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Exit master when all workers have exited
    cluster.on('exit', () => {
      if (!shuttingDown) return;
      const remaining = Object.keys(cluster.workers).length;
      if (remaining === 0) {
        log('All workers stopped, master exiting');
        process.exit(0);
      }
    });

    log('Master process ready');
  })().catch(err => {
    console.error('Master startup failed:', err);
    process.exit(1);
  });
} else {
  // Worker: route to the correct server based on type
  if (process.env.PRYV_WORKER_TYPE === 'hfs') {
    require('../components/hfs-server/bin/server');
  } else {
    require('../components/api-server/bin/server');
  }
}
