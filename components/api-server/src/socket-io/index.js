/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

/**
 * Note: Debug tests with: DEBUG=engine,socket.io* yarn test --grep="Socket"
 */

const socketIO = require('socket.io')({
  cors: {
    origin: true,
    methods: "GET,POST",
    credentials: true,
  },
  allowEIO3: true // for compatibility with v2 clients
});

const MethodContext = require('business').MethodContext;
import type {ContextSource} from 'business';

const Manager = require('./Manager');
const Paths = require('../routes/Paths');
const { getConfig, getLogger } = require('@pryv/boiler');
const { getStorageLayer } = require('storage');

import type { StorageLayer } from 'storage';
import type { CustomAuthFunction } from 'business';

import type API  from '../API';
import type { SocketIO$Handshake }  from './Manager';

// Initializes the SocketIO subsystem. 
//
async function setupSocketIO(
  server: net$Server, 
  api: API, 
  customAuthStepFn: ?CustomAuthFunction,
) {
  const config = await getConfig();
  const logger = getLogger('socketIO');
  const storageLayer = await getStorageLayer();
  const isOpenSource = config.get('openSource:isActive');


  const io = socketIO.listen(server, {
    path: Paths.SocketIO
  });

  // Manages socket.io connections and delivers method calls to the api. 
  const manager: Manager = new Manager(logger, io, api, storageLayer, customAuthStepFn, isOpenSource);
  
  // dynamicNamspaces allow to "auto" create namespaces
  // when connected pass the socket to Manager
  const dynamicNamespace = io.of(/^\/.+$/).on('connect', async (socket) => {
    const nameSpaceContext = await manager.ensureInitNamespace(socket.nsp.name);
    nameSpaceContext.onConnect(socket);
  });
  
  // add a middelware for authentication 
  // add middelware for authentication 
  dynamicNamespace.use(async (socket, next) => {
    try {
      const nsName = socket.nsp.name;
      const query = socket.handshake.query;
      const userName = manager.extractUsername(nsName);
      if (userName == null) throw new Error(`Invalid resource "${nsName}".`);
      if (query.auth == null) throw new Error("Missing 'auth' parameter with a valid access token.");
      const contextSource: ContextSource = {
        name: 'socket.io',
        ip:  socket.handshake.headers['x-forwarded-for'] || socket.request.connection.remoteAddress
      }
      
      const context = new MethodContext(
        contextSource,
        userName,
        query.auth,
        customAuthStepFn,
        storageLayer.events,
      );

      // Initailizing Context
      await context.init();

      // Load access
      await context.retrieveExpandedAccess(storageLayer);

      // attach context to socket for further usage.
      socket.methodContext = context;
      next(null, true);
    } catch (err) {
      next(err, false);
    }
  });

  // register wildcard to all namespaces
  dynamicNamespace.use(require('socketio-wildcard')());

}
module.exports = setupSocketIO; 
