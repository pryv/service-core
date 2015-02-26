var childProcess = require('child_process'),
    CronJob = require('cron').CronJob,
    dependencies = require('dependable').container({useFnAnnotations: true}),
    fs = require('fs'),
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
var settings = require('./config').load();

// register base dependencies

dependencies.register({
  // settings
  authSettings: settings.auth,
  eventFilesSettings: settings.eventFiles,
  eventTypesSettings: settings.eventTypes,
  httpSettings: settings.http,
  logsSettings: settings.logs,
  servicesSettings: settings.services,

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
  commonHeadersMiddleware: middleware.commonHeaders,
  errorsMiddleware: require('./middleware/errors'),
  initContextMiddleware: middleware.initContext,
  requestTraceMiddleware: middleware.requestTrace,

  // Express & app
  express: require('express'),
  expressApp: require('./expressApp')
});

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
    './methods/system',
    './methods/utility',
    './methods/auth',
    './methods/accesses',
    './methods/account',
    './methods/followedSlices',
    './methods/profile',
    './methods/streams',
    './methods/events',
    './methods/trackingFunctions'
  ].forEach(function (methodDefs) {
    dependencies.resolve(require(methodDefs));
  });

  // setup temp routes for handling requests during startup (incl. possible data migration)

  var expressApp = dependencies.get('expressApp');
  expressApp.setupTempRoutesForStartup();

  // setup HTTP and register server

  var server;
  if (! settings.http.noSSL) { // if SSL...
    var serverOptions = {
      key: fs.readFileSync(settings.http.certsPathAndKey + '-key.pem').toString(),
      cert: fs.readFileSync(settings.http.certsPathAndKey + '-cert.crt').toString(),
      ca: fs.readFileSync(settings.http.certsPathAndKey + '-ca.pem').toString()
    };
    server = require('https').createServer(serverOptions, expressApp);
  } else {
    server = require('http').createServer(expressApp);
  }
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
        ' [' + expressApp.settings.env + '] listening on ' + server.url);

    // TEST: execute test setup instructions if any
    if (process.env.NODE_ENV === 'development') {
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

        expressApp.clearTempRoutes();

        [
          './routes/system',
          './routes/root',
          './routes/auth',
          './routes/accesses',
          './routes/account',
          './routes/followed-slices',
          './routes/profile',
          './routes/streams',
          './routes/events'
        ].forEach(function (routeDefs) {
          dependencies.resolve(require(routeDefs));
        });

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
    cronTime: settings.nightlyScriptCronTime || '00 15 2 * * *',
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
    callback = (typeof callback === 'function') ? callback : function () {};

    var worker = childProcess.fork(__dirname + '/runNightlyTasks.js', process.argv.slice(2));
    workerRunning = true;
    worker.on('exit', function (code) {
      workerRunning = false;
      callback(code !== 0 ?
          new Error('Nightly script unexpectedly failed (see logs for details)') : null);
    });
  }
}

process.on('exit', function () {
  logger.info('API server exiting.');
});
