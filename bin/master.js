#!/usr/bin/env node

/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

// Master process: manages API workers via Node.js cluster module.
// Replaces runit-based multi-process orchestration.
//
// Usage:
//   node bin/master.js [--config <path>]
//
// Config keys:
//   cluster.apiWorkers  — number of API workers (default: 2)

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

    // Determine worker count
    const configuredWorkers = config.get('cluster:apiWorkers');
    const numWorkers = (configuredWorkers != null)
      ? configuredWorkers
      : Math.min(os.cpus().length, 4);

    let shuttingDown = false;
    let workerId = 0;

    log(`Forking ${numWorkers} API worker(s)`);
    for (let i = 0; i < numWorkers; i++) {
      forkWorker();
    }

    function forkWorker () {
      const id = workerId++;
      const worker = cluster.fork({ PRYV_BOILER_SUFFIX: `-w${id}` });
      log(`Worker w${id} started (pid ${worker.process.pid})`);
    }

    cluster.on('exit', (worker, code, signal) => {
      if (shuttingDown) return;
      log(`Worker pid ${worker.process.pid} died (code=${code} signal=${signal}), restarting`);
      forkWorker();
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
  // Worker: run the existing api-server
  require('../components/api-server/bin/server');
}
