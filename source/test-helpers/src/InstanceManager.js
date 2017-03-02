var async = require('async'),
    axon = require('axon'),
    deepEqual = require('deep-equal'),
    EventEmitter = require('events').EventEmitter,
    fs = require('fs'),
    spawn = require('child_process').spawn,
    temp = require('temp'),
    util = require('util');

module.exports = InstanceManager;

/**
 * Manages the test server instance (use as singleton).
 *
 * - Server runs in a spawned child process (note: the server must send a "server-ready" message on
 *   its TCP pub socket when appropriate)
 * - Settings are passed via a temp JSON file; server only restarts if settings change
 * - Forwards TCP messages published by the server as regular events for interested tests to check
 *
 * Usage: just call `server.ensureStarted(settings, callback)` before running tests.
 *
 * @param {Object} settings Must contain `serverFilePath`, `tcpMessaging` and `logging`
 * @constructor
 */
function InstanceManager(settings) {
  InstanceManager.super_.call(this);

  var serverSettings = null,
      tempConfigPath = temp.path({suffix: '.json'}),
      serverProcess = null,
      serverReady = false,
      messagingSocket = axon.socket('sub-emitter'),
      logger = settings.logging.getLogger('instance-manager');

  // setup TCP messaging subscription

  messagingSocket.bind(+settings.tcpMessaging.port, settings.tcpMessaging.host, function () {
    logger.debug('TCP sub socket ready on ' + settings.tcpMessaging.host + ':' +
        settings.tcpMessaging.port);
  });

  messagingSocket.on('*', function (message, data) {
    if (message === 'server-ready') {
      serverReady = true;
    }
    // forward messages to our own listeners
    this.emit(message, data);
  }.bind(this));

  /**
   * Makes sure the instance is started with the given config settings, restarting it if needed;
   * does nothing if the instance is already running with the same settings.
   *
   * @param {Object} settings
   * @param {Function} callback
   */
  this.ensureStarted = function (settings, callback) {
    if (deepEqual(settings, serverSettings)) {
      if (isRunning()) {
        // nothing to do
        return callback();
      }
    } else {
      if (isRunning()) {
        try {
          this.stop();
        } catch (err) {
          return callback(err);
        }
      }
      serverSettings = settings;
      this.setup();
    }
    this.start(callback);
  };

  /**
   * Just restarts the instance, leaving settings as they are.
   *
   * @param {Function} callback
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

  /**
   * @api private
   */
  this.setup = function () {
    // adjust config settings for test instance
    serverSettings.tcpMessaging.pubConnectInsteadOfBind = true;

    this.url = 'http://' + serverSettings.http.ip + ':' + serverSettings.http.port;
  };

  /**
   * @api private
   */
  this.start = function (callback) {
    if (isRunning()) {
      throw new Error('Server is already running; stop it first.');
    }

    console.log('starting server, yo');
    // write config to temp path
    fs.writeFileSync(tempConfigPath, JSON.stringify(serverSettings));
    var args = ['--config=' + tempConfigPath];

    args.unshift(settings.serverFilePath);

    // setup debug if needed (assumes current process debug port is 5858 i.e. default)

    if (process.execArgv.indexOf('--debug') !== -1) {
      args.unshift('--debug=5859');
    }
    if (process.execArgv.indexOf('--debug-brk') !== -1) {
      args.unshift('--debug-brk=5859');
    }

    // set profiling if needed

    if (serverSettings.profile) {
      args.unshift('--prof');
    }

    // start proc

    logger.debug('Starting server instance... ');
    var options = {
      // Remove comment here if you want to see server output
      // stdio: 'inherit',
      env: process.env
    };
    serverProcess = spawn(process.argv[0], args, options);
    var serverExited = false,
        exitCode = null;
    serverProcess.on('exit', function (code/*, signal*/) {
      logger.debug('Server instance exited with code ' + code);
      serverExited = true;
      exitCode = code;
    });

    async.until(isReadyOrExited, function (next) { setTimeout(next, 100); }, function () {
      if (serverExited && exitCode > 0) {
        return callback(new Error('Server failed (code ' + exitCode + ')'));
      }
      callback();
    });

    function isReadyOrExited() {
      return serverReady || serverExited;
    }
  };

  this.crashed = function () {
    return serverProcess && serverProcess.exitCode > 0;
  };

  /**
   * @api private
   */
  this.stop = function () {
    if (! isRunning()) { return; }
    logger.debug('Killing server instance... ');
    if (! serverProcess.kill()) {
      logger.warn('Failed to kill the server instance (it may have exited already).');
    }
    serverProcess = null;
    serverReady = false;
  };

  function isRunning() {
    return !! serverProcess;
  }

  process.on('exit', this.stop);
}
util.inherits(InstanceManager, EventEmitter);
