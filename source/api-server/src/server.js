// @flow

const express = require('express');

var childProcess = require('child_process'),
    CronJob = require('cron').CronJob,
    dependencies = require('dependable').container({useFnAnnotations: true}),
    errors = require('components/errors'),
    middleware = require('components/middleware'),
    storage = require('components/storage'),
    utils = require('components/utils'),
    Notifications = require('./Notifications'),
    API = require('./API');

/**
 * Runs the server.
 * Launch with `node server [options]`.
 */

// load config settings
var config = require('./config');
config.printSchemaAndExitIfNeeded();
var settings = config.load();

// register base dependencies

dependencies.register({
  // settings
  authSettings: settings.auth,
  eventFilesSettings: settings.eventFiles,
  eventTypesSettings: settings.eventTypes,
  httpSettings: settings.http,
  logsSettings: settings.logs,
  servicesSettings: settings.services,
  customExtensionsSettings: settings.customExtensions,

  // misc utility
  serverInfo: require('../package.json'),
  logging: utils.logging
});

var logging = dependencies.get('logging'),
    logger = logging.getLogger('server'),
    database = new storage.Database(settings.database, logging);

dependencies.register({
  // storage
  versionsStorage: new storage.Versions(database, settings.eventFiles.attachmentsDirPath,
      logging),
  passwordResetRequestsStorage: new storage.PasswordResetRequests(database,
      {maxAge: settings.auth.passwordResetRequestMaxAge}),
  sessionsStorage: new storage.Sessions(database, {maxAge: settings.auth.sessionMaxAge}),
  usersStorage: new storage.Users(database),
  userAccessesStorage: new storage.user.Accesses(database),
  userEventFilesStorage: new storage.user.EventFiles(settings.eventFiles, logging),
  userEventsStorage: new storage.user.Events(database),
  userFollowedSlicesStorage: new storage.user.FollowedSlices(database),
  userProfileStorage: new storage.user.Profile(database),
  userStreamsStorage: new storage.user.Streams(database),

  // Express middleware
  attachmentsAccessMiddleware: middleware.attachmentsAccess,
  initContextMiddleware: middleware.initContext,
  
  express: express, 
});

const {app, lifecycle} = require('./expressApp')(dependencies);
dependencies.register({expressApp: app});

// start TCP pub messaging

utils.messaging.openPubSocket(settings.tcpMessaging, function (err, messagingSocket) {
  if (err) {
    logger.error('Error setting up TCP pub socket: ' + err);
    process.exit(1);
  }
  logger.info('TCP pub socket ready on ' + settings.tcpMessaging.host + ':' +
      settings.tcpMessaging.port);

  // register dependencies (continued)

  dependencies.register({
    eventTypes: require('./schema/eventTypes'),
    notifications: new Notifications(messagingSocket),
    api: new API(),
    systemAPI: new API() // use separate API instance to avoid any possible security issue
  });

  // register API methods

  [
    require('./methods/system'),
    require('./methods/utility'),
    require('./methods/auth'),
    require('./methods/accesses'),
    require('./methods/account'),
    require('./methods/followedSlices'),
    require('./methods/profile'),
    require('./methods/streams'),
    require('./methods/events'),
    require('./methods/trackingFunctions'),
  ].forEach(function (moduleDef) {
    dependencies.resolve(moduleDef);
  });

  // setup temp routes for handling requests during startup (incl. possible data migration)

  lifecycle.appStartupBegin(); 

  // setup HTTP and register server

  var server = require('http').createServer(app);
  module.exports = server;
  dependencies.register({server: server});

  // setup web sockets

  dependencies.resolve(require('./sockets/init'));

  // start listening to HTTP

  server.listen(settings.http.port, settings.http.ip, function () {
    var address = server.address();
    var protocol = server.key ? 'https' : 'http';
    server.url = protocol + '://' + address.address + ':' + address.port;
    logger.info('API server v' + require('../package.json').version +
        ' [' + app.settings.env + '] listening on ' + server.url);

    // TEST: execute test setup instructions if any
    if (process.env.NODE_ENV === 'test') {
      try {
        require('components/test-helpers').instanceTestSetup.executeIfAny(settings,
            messagingSocket);
      } catch (err) {
        logger.warn('Error executing instance test setup instructions: ' + err.message);
      }
    }

    database.waitForConnection(function () {
      dependencies.get('versionsStorage').migrateIfNeeded(function (err) {
        if (err) {
          errors.errorHandling.logError(err, null, logger);
          return;
        }

        // ok: setup proper API routes
        
        lifecycle.appStartupComplete(); 

        [
          require('./routes/system'),
          require('./routes/root'),
          require('./routes/auth'),
          require('./routes/accesses'),
          require('./routes/account'),
          require('./routes/followed-slices'),
          require('./routes/profile'),
          require('./routes/streams'),
          require('./routes/events'),
        ].forEach(function (moduleDef) {
          dependencies.resolve(moduleDef);
        });
        
        // ok: All routes setup. Add error handling middleware. 
        
        lifecycle.routesAdded(); 

        // all right

        logger.info('Server ready');
        dependencies.get('notifications').serverReady();

        setupNightlyScript(server);
      });
    });
  });
});

/**
 * @param server The server object to expose function `runNightlyScript()` on
 */
function setupNightlyScript(server) {
  var workerRunning = false;
  var cronJob = new CronJob({
    cronTime: settings.nightlyScriptCronTime || '00 15 2 * * *',
    onTick: function () {
      if (workerRunning) {
        return;
      }

      logger.info('Starting nightly script (cron job)...');
      runScript();
    }
  });

  logger.info('Cron job setup for nightly script, time pattern: ' + cronJob.cronTime);
  cronJob.start();
  server.runNightlyScript = runScript;

  /**
   * @param {Function} callback Optional, will be passed an error on failure
   */
  function runScript(callback) {
    var worker = childProcess.fork(__dirname + '/runNightlyTasks.js', process.argv.slice(2));
    workerRunning = true;
    worker.on('exit', function (code) {
      workerRunning = false;
      
      if (! callback) { return; }
      if (code !== 0) {
        return callback(
          new Error('Nightly script unexpectedly failed (see logs for details)'));
      }

      callback();
    });
  }
}

process.on('exit', function () {
  logger.info('API server exiting.');
});
