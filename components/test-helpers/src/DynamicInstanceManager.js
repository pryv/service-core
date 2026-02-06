/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

/**
 * DynamicInstanceManager - Instance manager with dynamic port allocation
 * Enables parallel test execution by allocating unique ports per instance
 */

const async = require('async');
const axon = require('axon');
const EventEmitter = require('events').EventEmitter;
const fs = require('fs');
const spawn = require('child_process').spawn;
const temp = require('temp');
const util = require('util');

const { getLogger } = require('@pryv/boiler');
const portAllocator = require('./portAllocator');

module.exports = DynamicInstanceManager;

let spawnCounter = 0;

/**
 * Manages test server instances with dynamic port allocation.
 * Unlike InstanceManager, this allocates ports dynamically enabling parallel testing.
 *
 * Usage:
 *   const manager = new DynamicInstanceManager({ serverFilePath: '...' });
 *   await manager.ensureStartedAsync(settings);
 *   // use manager.url for HTTP requests
 *   // use manager.on('axon-*', callback) for notifications
 *
 * @param {Object} config Must contain `serverFilePath`
 * @param {Object} options Optional: { messagePrefix: string } for axon message filtering
 * @constructor
 */
function DynamicInstanceManager (config, options = {}) {
  DynamicInstanceManager.super_.call(this);

  const messagePrefix = options.messagePrefix || '';
  let serverSettings = null;
  const tempConfigPath = temp.path({ suffix: '.json' });
  let serverProcess = null;
  let serverReady = false;
  let messagingSocket = null;
  let allocatedHttpPort = null;
  let allocatedAxonPort = null;
  const logger = getLogger('dynamic-instance-manager');
  const self = this;

  // Cleanup handler
  const cleanup = () => {
    if (serverProcess) {
      try {
        serverProcess.kill('SIGKILL');
      } catch (e) {
        // Ignore
      }
      serverProcess = null;
    }
    if (messagingSocket) {
      try {
        messagingSocket.close();
      } catch (e) {
        // Ignore
      }
      messagingSocket = null;
    }
  };

  // Register cleanup handlers for graceful shutdown
  process.on('exit', cleanup);
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  /**
   * Setup axon messaging with allocated port
   */
  const setupAxonMessaging = (port, host) => {
    if (messagingSocket) {
      try {
        messagingSocket.close();
      } catch (e) {
        // Ignore
      }
    }

    messagingSocket = axon.socket('sub-emitter');
    allocatedAxonPort = port;

    messagingSocket.bind(+port, host, function () {
      logger.debug(`TCP sub socket ready on ${host}:${port}`);
    });

    messagingSocket.on('*', function (message, data) {
      // Support message prefix filtering for isolation
      const effectiveMessage = messagePrefix
        ? (message.startsWith(messagePrefix) ? message : null)
        : message;

      if (!effectiveMessage) return;

      if (message === 'axon-server-ready') {
        serverReady = true;
      }
      // Forward messages to listeners
      self.emit(message, data);
    });
  };

  /**
   * Allocate ports and start the server
   * @param {Object} inputSettings - Server configuration settings
   * @param {Function} callback
   */
  this.ensureStarted = function (inputSettings, callback) {
    const settingsCopy = structuredClone(inputSettings);

    // Force console settings
    if (typeof settingsCopy.logs === 'undefined') settingsCopy.logs = {};
    if (typeof settingsCopy.logs.console === 'undefined') settingsCopy.logs.console = {};

    if (process.env.LOGS) {
      settingsCopy.logs.console.active = true;
      settingsCopy.logs.console.level = process.env.LOGS;
    } else {
      settingsCopy.logs.console.active = false;
    }

    // Stop existing server if running
    if (isRunning()) {
      try {
        self.stop();
      } catch (err) {
        return callback(err);
      }
    }

    // Allocate ports asynchronously
    (async () => {
      try {
        const [httpPort, axonPort] = await portAllocator.allocatePorts(2);
        allocatedHttpPort = httpPort;

        // Configure HTTP
        settingsCopy.http = settingsCopy.http || {};
        settingsCopy.http.port = httpPort;
        settingsCopy.http.ip = settingsCopy.http.ip || '127.0.0.1';

        // Configure axon messaging
        settingsCopy.axonMessaging = settingsCopy.axonMessaging || {};
        settingsCopy.axonMessaging.port = axonPort;
        settingsCopy.axonMessaging.host = settingsCopy.axonMessaging.host || '127.0.0.1';
        settingsCopy.axonMessaging.enabled = true;
        settingsCopy.axonMessaging.pubConnectInsteadOfBind = true;

        // Setup axon messaging with allocated port
        setupAxonMessaging(axonPort, settingsCopy.axonMessaging.host);

        serverSettings = settingsCopy;
        self.url = `http://${settingsCopy.http.ip}:${httpPort}`;

        logger.debug(`Starting server on port ${httpPort}, axon on ${axonPort}`);
        self.start(callback);
      } catch (err) {
        callback(err);
      }
    })();
  };

  this.ensureStartedAsync = util.promisify(this.ensureStarted).bind(this);

  /**
   * Restart the server with the same settings
   */
  this.restart = function (callback) {
    if (isRunning()) {
      try {
        this.stop();
      } catch (err) {
        return callback(err);
      }
    }
    this.start(callback);
  };

  this.restartAsync = util.promisify(this.restart).bind(this);

  /**
   * Start the server process
   * @api private
   */
  this.start = function (callback) {
    if (isRunning()) {
      throw new Error('Server is already running; stop it first.');
    }

    // Write config to temp file
    fs.writeFileSync(tempConfigPath, JSON.stringify(serverSettings, null, 2));
    const args = ['--config=' + tempConfigPath];
    args.unshift(config.serverFilePath);

    // Debug support
    if (process.execArgv.indexOf('--debug') !== -1) {
      args.unshift('--debug=5859');
    }
    if (process.execArgv.indexOf('--debug-brk') !== -1) {
      args.unshift('--debug-brk=5859');
    }

    // Profiling support
    if (serverSettings.profile) {
      args.unshift('--prof');
    }

    logger.debug('Starting server instance with config ' + tempConfigPath);
    const options = {
      stdio: 'inherit',
      env: { ...process.env, PRYV_BOILER_SUFFIX: '-dyn' + spawnCounter++ }
    };

    serverProcess = spawn(process.argv[0], args, options);
    let serverExited = false;
    let exitCode = null;

    serverProcess.on('exit', function (code) {
      logger.debug('Server instance exited with code ' + code);
      serverExited = true;
      exitCode = code;
      serverProcess = null;
    });

    serverProcess.on('error', function (err) {
      logger.error('Server process error:', err);
      serverExited = true;
      exitCode = 1;
      serverProcess = null;
    });

    async.until(isReadyOrExited, function (next) { setTimeout(next, 100); }, function () {
      if (serverExited && exitCode > 0) {
        return callback(new Error('Server failed (code ' + exitCode + ')'));
      }
      callback();
    });

    function isReadyOrExited () {
      return serverReady || serverExited;
    }
  };

  /**
   * Check if the server crashed
   */
  this.crashed = function () {
    return serverProcess && serverProcess.exitCode > 0;
  };

  /**
   * Stop the server
   */
  this.stop = function () {
    if (!isRunning()) { return; }
    logger.debug('Stopping server instance...');

    // Try graceful shutdown first
    try {
      serverProcess.kill('SIGTERM');
    } catch (e) {
      // If SIGTERM fails, try SIGKILL
      try {
        serverProcess.kill('SIGKILL');
      } catch (e2) {
        logger.warn('Failed to kill the server instance');
      }
    }

    serverProcess = null;
    serverReady = false;
  };

  /**
   * Force kill (for cleanup after errors)
   */
  this.forceKill = function () {
    cleanup();
  };

  /**
   * Get allocated HTTP port
   */
  this.getPort = function () {
    return allocatedHttpPort;
  };

  /**
   * Get allocated axon port
   */
  this.getAxonPort = function () {
    return allocatedAxonPort;
  };

  function isRunning () {
    return !!serverProcess;
  }
}
util.inherits(DynamicInstanceManager, EventEmitter);
