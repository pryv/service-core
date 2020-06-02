// @flow

/**
 * Note: Debug tests with: DEBUG=engine,socket.io* yarn test --grep="Socket"
 */

const socketIO = require('socket.io');

const MethodContext = require('components/model').MethodContext;
const NATS_CONNECTION_URI = require('components/utils').messaging.NATS_CONNECTION_URI;

const Manager = require('./Manager');
const Paths = require('../routes/Paths');

const ChangeNotifier = require('./change_notifier');
const NatsPublisher = require('./nats_publisher');

import type { Logger } from 'components/utils';
import type { StorageLayer } from 'components/storage';
import type { CustomAuthFunction } from 'components/model';

import type API from '../API';
import type { SocketIO$Handshake } from './Manager';

// Initializes the SocketIO subsystem. 
//
function setupSocketIO(
  server: net$Server, logger: Logger, 
  notifications: EventEmitter, api: API, 
  storageLayer: StorageLayer, 
  customAuthStepFn: ?CustomAuthFunction, 
) {
  const io = socketIO.listen(server, {
    path: Paths.SocketIO
  });
  io.use(initUsersNameSpaces);

  // Manages socket.io connections and delivers method calls to the api. 
  const manager: Manager = new Manager(logger, io, api, storageLayer, customAuthStepFn);
  
  // Setup the chain from notifications -> NATS
  const natsPublisher = new NatsPublisher(NATS_CONNECTION_URI, 
    (userName: string): string => { return `${userName}.sok1`; }
  );
  const changeNotifier = new ChangeNotifier(natsPublisher);
  changeNotifier.listenTo(notifications);

  // Webhooks nats publisher - could be moved if there is a more convenient place.
  const whNatsPublisher = new NatsPublisher(NATS_CONNECTION_URI,
    (userName: string): string => { return `${userName}.wh1`; }
  );
  const webhooksChangeNotifier = new ChangeNotifier(whNatsPublisher);
  webhooksChangeNotifier.listenTo(notifications);
  
  async function initUsersNameSpaces(
    socket, callback: (err: any, res: any) => mixed
  ) {
    try {
      const handshake = socket.handshake;
      const nsName = handshake.query.resource;
      if (nsName == null) throw new Error("Missing 'resource' parameter.");
      
      const userName = manager.extractUsername(nsName); 
        if (userName == null) throw new Error(`Invalid resource "${nsName}".`);

      const accessToken = handshake.query.auth;
      if (accessToken == null) 
        throw new Error("Missing 'auth' parameter with a valid access token.");

      const context = new MethodContext(
        userName, accessToken, 
        customAuthStepFn);
        
  
      // Load user, init the namespace
      await context.retrieveUser(storageLayer);
      if (context.user == null) throw new Error('AF: context.user != null');
      manager.ensureInitNamespace(nsName); 
    
      callback(null, true);
    } catch (err) {
      callback(err);
    }
  }
}
module.exports = setupSocketIO; 
