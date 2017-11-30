// @flow

const errorHandling = require('components/errors').errorHandling;
const setCommonMeta = require('../methods/helpers/setCommonMeta');
const bluebird = require('bluebird');
const util = require('util');
    
import type { Logger } from 'components/utils';
import type { MethodContext } from 'components/model';
import type API from '../API';

import type { MessageSink } from './change_notifier';

type SocketIO$SocketId = string; 
export type SocketIO$Handshake = {
  methodContext: MethodContext,
  query: {
    resource: string,
    auth: string, 
  }
}; 
type SocketIO$CallData = {
  name: string, 
  args: Array<mixed>,
}; 
type SocketIO$Socket = {
  id: SocketIO$SocketId;
  on(string, ...a: Array<mixed>): mixed; 
  namespace: SocketIO$Namespace;
};
type SocketIO$Namespace = {
  // Here's a bad interface.
  on(string, ...a: Array<mixed>): mixed; 
  emit(string, ...a: Array<mixed>): void; 
  name: string; 
}
type SocketIO$Server = {
  of: (string) => SocketIO$Namespace; 
  handshaken: {[id: SocketIO$SocketId]: SocketIO$Handshake};
}; 
type NamespaceContext = {
  user: User; 
  socketNs: SocketIO$Namespace;
};

type User = { username: string };

// Singleton for managing sockets access:
//
//   - dynamic namespaces per user
// 
class Manager implements MessageSink {
  contexts: Map<string, NamespaceContext>; 
  connections: Map<SocketIO$SocketId, Connection>; 
  
  logger: Logger; 
  io: SocketIO$Server; 
  api: API; 
  
  constructor(
    logger: Logger, io: SocketIO$Server, api: API
  ) {
    this.logger = logger; 
    this.io = io; 
    this.api = api; 

    this.contexts = new Map(); 
    this.connections = new Map(); 
  }
  
  // Returns true if the `candidate` could be a username on a lexical level. 
  // 
  looksLikeUsername(candidate: string): boolean {
    const reUsername = /^([a-zA-Z0-9])(([a-zA-Z0-9-]){3,21})[a-zA-Z0-9]$/; 
    
    return reUsername.test(candidate);
  }

  // Extracts the username from the given valid namespace name.
  // Returns null if the given `namespaceName` cannot be parsed as a user name. 
  // 
  //    manager.getUsername('/foobar') // => 'foobar'
  //
  extractUsername(namespaceName: string): ?string {
    if (! namespaceName.startsWith('/')) return null; 

    // assert: namespaceName[0] === '/'
    const candidate = namespaceName.slice(1);
      
    if (! this.looksLikeUsername(candidate)) return null; 
    
    return candidate;
  }
  
  // Returns true if we already have a context for the given `namespaceName`.
  hasContextForNamespace(namespaceName: string): boolean {
    return this.contexts.has(namespaceName);
  }
  
  // Retrieves the namespace context given a namespace. 
  // 
  getContext(namespaceName: string): ?NamespaceContext {
    const contexts = this.contexts; 
    
    const context = contexts.get(namespaceName);
    if (context == null) return null; 

    return context; 
  }
  
  // Looks up a namespace and returns the user from the namespace context. This
  // is aequivalent to `getNamespace('/namespace').user`.
  // 
  //    getUser('/mynamespace') // => user instance.
  // 
  getUser(namespaceName: string): ?User {
    const context = this.getContext(namespaceName);
    return context && context.user;
  }
  
  // Sets up the namespace with the given name and user, if not already present.
  // 
  ensureInitNamespace(namespaceName: string, user: User) {
    const io = this.io; 
    const logger = this.logger; 
    const contexts = this.contexts;
    
    // If the namespace has a context, abort. 
    if (this.hasContextForNamespace(namespaceName)) return; 
    
    logger.debug(`Initializing namespace '${namespaceName}'`);

    const socketNs = io.of(namespaceName);
    const ctx = {
      user: user, 
      socketNs: socketNs, 
      methodContexts: new Map(),
    };
    
    contexts.set(namespaceName, ctx);
    
    socketNs.on('connection', (socket: SocketIO$Socket) => this.onNsConnect(socket));
  }
  
  storeConnection(conn: Connection) {
    const connections = this.connections;
    
    connections.set(conn.id, conn);
  }
  deleteConnection(conn: Connection) {
    const connections = this.connections;
      
    connections.delete(conn.id);
  }
  
  // Given a `userName` and a `message`, delivers the `message` as a socket.io
  // event to all clients currently connected to the namespace '/USERNAME'.
  //
  deliver(userName: string, message: string): void {
    const context = this.getContext(`/${userName}`);
    if (context == null) return; 
    
    const namespace = context.socketNs;
    if (namespace == null) 
      throw new Error('AF: namespace should not be null');
    
    namespace.emit(message);
  }
  
  // ------------------------------------------------------------ event handlers

  // Called by our own message bus upon reception of an internal event. 
  // 
  handleNotification(user: User, externalName: string) {
    const userName = user.username;
    const context = this.getContext(`/${userName}`);
    if (context == null) return; 
    
    const namespace = context.socketNs;
    if (namespace == null) 
      throw new Error('AF: namespace should not be null');
    
    namespace.emit(externalName);
  }
    
  // Called when a new connection is made to a namespace.
  //
  onNsConnect(socket: SocketIO$Socket) {
    const logger = this.logger; 
    const io = this.io; 
    
    const namespaceName = socket.namespace.name;
    const context = this.getContext(namespaceName);
    
    logger.debug(`New client connected on namespace '${namespaceName}`);
    
    if (context == null) {
      logger.warn(`AF: onNsConnect received for '${namespaceName}', but no context was available.`);
      return; 
    }
    // assert: context != null
    
    // Extract the methodContext from the handshake: 
    const socketHandshake = io.handshaken[socket.id];
    // FLOW This is attached to the handshake by our authorizeUserMiddleware.
    const methodContext = socketHandshake.methodContext; 
    
    if (methodContext == null) {
      logger.warn('AF: onNsConnect received handshake w/o method context.');
      return; 
    }

    // This will represent state that we keep for every connection. 
    const connection = new Connection(
      this.logger, socket.id, methodContext, this.api);

    // TODO Either add namespace deletion here or remove the whole doodle altoghether.
    this.storeConnection(connection);
    socket.on('disconnect', 
      () => this.onDisconnect(connection));
    
    connection.registerCallbacks(socket);
  }
  
  // Called when the underlying socket-io socket disconnects.
  //
  onDisconnect(conn: Connection) {
    this.deleteConnection(conn);
  }
}

class Connection {
  id: SocketIO$SocketId; 
  methodContext: MethodContext;
  api: API; 
  logger: Logger; 
  
  constructor(
    logger: Logger, 
    id: SocketIO$SocketId, methodContext: MethodContext, api: API
  ) {
    this.id = id; 
    this.methodContext = methodContext; 
    this.api = api; 
    this.logger = logger; 
  }
  
  registerCallbacks(socket: SocketIO$Socket) {
    // Attach a few handlers to this socket. 
    socket.on('*', (callData, callback) => this.onMethodCall(callData, callback));
  }
  
  // ------------------------------------------------------------ event handlers
  
  // Called when the socket wants to call a Pryv IO method. 
  // 
  async onMethodCall(callData: SocketIO$CallData, callback: (err: mixed, res: any) => mixed) {
    const api = this.api; 
    const logger = this.logger; 
    
    // Make sure that we have a callback here. 
    if (callback == null) callback = function(err: any) { }; // eslint-disable-line no-unused-vars
    
    const methodContext = this.methodContext;
    const userName = methodContext.username; 
    
    const method = callData.name; 
    const params = callData.args[0];
    
    logger.debug(
      `Call: for '${userName}', method '${method}', body ${util.inspect(params)}`);
      
    const answer = bluebird.fromCallback(
      (cb) => api.call(method, methodContext, params, cb));
      
    try {
      const result = await answer; 
      return result.toObject((obj) => callback(null, setCommonMeta(obj)));
    }
    catch (err) {
      errorHandling.logError(err, {
        url: `socketIO/${userName}`,
        method: method,
        body: params
      }, logger);
      return callback(
        setCommonMeta({ error: errorHandling.getPublicErrorData(err) }));
    }
    // NOT REACHED
  }
}

module.exports = Manager; 