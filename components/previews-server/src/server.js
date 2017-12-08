const dependencies = require('dependable').container({useFnAnnotations: true});
const middleware = require('components/middleware');
const storage = require('components/storage');
const utils = require('components/utils');

const ExtensionLoader = utils.extension.ExtensionLoader;

/**
 * Runs the server.
 * Launch with `node server [options]`.
 */

// load config settings
var config = require('./config');
config.printSchemaAndExitIfNeeded();
var settings = config.load();

const customAuthStepFn = loadCustomAuthStepFn(settings.customExtensions); 

// register base dependencies
dependencies.register({
  // settings
  authSettings: settings.auth,
  eventFilesSettings: settings.eventFiles,
  httpSettings: settings.http,
  logsSettings: settings.logs,

  // misc utility
  serverInfo: require('../package.json'),
  logging: utils.logging
});

const logging = dependencies.get('logging');
const logger = logging.getLogger('server');

const database = new storage.Database(
  settings.database, logging.getLogger('database'));

const storageLayer = {
  sessions: new storage.Sessions(database, {maxAge: settings.auth.sessionMaxAge}),
  users: new storage.Users(database),
  accesses: new storage.user.Accesses(database),
  eventFiles: new storage.user.EventFiles(
    settings.eventFiles, logging.getLogger('eventFiles')),
  events: new storage.user.Events(database),
  streams: new storage.user.Streams(database),
};

const initContextMiddleware = middleware.initContext(
  storageLayer,
  customAuthStepFn);

dependencies.register({
  // storage
  sessionsStorage: storageLayer.sessions,
  usersStorage: storageLayer.users,
  userAccessesStorage: storageLayer.accesses,
  userEventFilesStorage: storageLayer.eventFiles,
  userEventsStorage: storageLayer.events,
  userStreamsStorage: storageLayer.streams,

  // Express middleware
  commonHeadersMiddleware: middleware.commonHeaders,
  errorsMiddleware: require('./middleware/errors'),
  initContextMiddleware: initContextMiddleware,
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

function loadCustomAuthStepFn(customExtensions) {
  const defaultFolder = customExtensions.defaultFolder;
  const customAuthStepFnPath = customExtensions.customAuthStepFn;
  
  const loader = new ExtensionLoader(defaultFolder);
  
  if (customAuthStepFnPath != null) 
    return loader.loadFrom(customAuthStepFnPath);
    
  return loader.load('customAuthStepFn');
}