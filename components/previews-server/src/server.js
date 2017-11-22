var dependencies = require('dependable').container({useFnAnnotations: true}),
    middleware = require('components/middleware'),
    storage = require('components/storage'),
    utils = require('components/utils');

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
  httpSettings: settings.http,
  logsSettings: settings.logs,
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
  sessionsStorage: new storage.Sessions(database, {maxAge: settings.auth.sessionMaxAge}),
  usersStorage: new storage.Users(database),
  userAccessesStorage: new storage.user.Accesses(database),
  userEventFilesStorage: new storage.user.EventFiles(settings.eventFiles, logging),
  userEventsStorage: new storage.user.Events(database),
  userStreamsStorage: new storage.user.Streams(database),

  // Express middleware
  commonHeadersMiddleware: middleware.commonHeaders,
  errorsMiddleware: require('./middleware/errors'),
  initContextMiddleware: middleware.initContext,
  requestTraceMiddleware: middleware.requestTrace,

  // Express & app
  express: require('express'),
});

const {expressApp, routesDefined} = dependencies.resolve(
  require('./expressApp'));
dependencies.register('expressApp', expressApp);

// setup routes

[
  './routes/index',
  './routes/event-previews'
].forEach(function (routeDefs) {
  dependencies.resolve(require(routeDefs));
});

// Finalize middleware stack: 
routesDefined(); 

// setup HTTP

var server = require('http').createServer(expressApp);
module.exports = server;

// Go

utils.messaging.openPubSocket(settings.tcpMessaging, function (err, pubSocket) {
  if (err) {
    logger.error('Error setting up TCP pub socket: ' + err);
    process.exit(1);
  }
  logger.info('TCP pub socket ready on ' + settings.tcpMessaging.host + ':' +
      settings.tcpMessaging.port);

  database.waitForConnection(function () {
    server.listen(settings.http.port, settings.http.ip, function () {
      var address = server.address();
      var protocol = server.key ? 'https' : 'http';
      server.url = protocol + '://' + address.address + ':' + address.port;
      logger.info('Browser server v' + require('../package.json').version +
          ' [' + expressApp.settings.env + '] listening on ' + server.url);

      // all right

      logger.info('Server ready');
      pubSocket.emit('server-ready');
    });
  });
});

process.on('exit', function () {
  logger.info('Browser server exiting.');
});
