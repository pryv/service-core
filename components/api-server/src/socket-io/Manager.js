// @flow

const errorHandling = require('components/errors').errorHandling;
const setCommonMeta = require('../methods/helpers/setCommonMeta');
const bluebird = require('bluebird');
const lodash = require('lodash');

const NatsSubscriber = require('./nats_subscriber');
    
import type { Logger } from 'components/utils';
import type { MethodContext } from 'components/model';
import type API from '../API';

import type { MessageSink } from './message_sink';

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
  once(string, ...a: Array<mixed>): mixed; 
  namespace: SocketIO$Namespace;
};
type SocketIO$Namespace = {
  // Here's a bad interface.
  on(string, ...a: Array<mixed>): mixed; 
  emit(string, ...a: Array<mixed>): void; 
  name: string; 
  sockets: {[socketId: SocketIO$SocketId]: SocketIO$Socket};
}
type SocketIO$Server = {
  of: (string) => SocketIO$Namespace; 
  handshaken: {[id: SocketIO$SocketId]: SocketIO$Handshake};
}; 

type User = { username: string };

// Manages context and connections for socket-io. Usual sequence of things will 
// be: 
// 
//  * The code in index.js sets up a methodContext instance and attaches it to 
//    the handshake object. 
//  * It calls `ensureInitNamespace` to make sure that we have a NamespaceContext
//    instance for the connection. 
//  * socket.io connects the client and calls 'onNsConnect' on the manager. 
//  * manager creates a 'Connection' instance and calls `storeConnection` to 
//    persist the connection. 
//  * User calls methods on the connection, which will translate into 
//    `onMethodCall` on the connection. 
//  * ...
//  * Once disconnection is registered, socket.io will call 'onDisconnect' on 
//    the manager, which will in turn call `deleteConnection`.
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
  
  // Retrieves the namespace context given a namespace. 
  // 
  getContext(namespaceName: string): ?NamespaceContext {
    const contexts = this.contexts; 
    
    return contexts.get(namespaceName);
  }
  
  // Retrieves the namespace context from this.contexts - or calls `missingCb` 
  // if no such namespace exists yet. The namespace returned from `missingCb` 
  // is then stored in the contexts map. 
  // 
  ensureContext(
    namespaceName: string, missingCb: () => NamespaceContext
  ): NamespaceContext {
    const contexts = this.contexts; 
    
    let context = contexts.get(namespaceName);
    
    // Value is not missing, return it. 
    if (context != null) return context; 
    
    // Value is missing, produce it. 
    context = missingCb();

    contexts.set(namespaceName, context);
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
  async ensureInitNamespace(namespaceName: string, user: User) {
    const context = this.ensureContext(namespaceName, 
      () => this.setupNamespaceContext(namespaceName, user));
    
    // On every path, reopen the context resources. 
    await context.open(); 
  }
  
  // Creates a NamespaceContext and stores it in the contexts map. The context
  // will not be open yet. 
  // 
  setupNamespaceContext(namespaceName: string, user: User): NamespaceContext {
    const io = this.io; 
    const logger = this.logger; 
    const socketNs = io.of(namespaceName);
    const ctx = new NamespaceContext(user, socketNs, this);

    logger.debug(`Initializing namespace '${namespaceName}'`);
    
    socketNs.on('connection', (socket: SocketIO$Socket) => this.onNsConnect(socket));

    return ctx; 
  }
  
  storeConnection(conn: Connection) {
    const connections = this.connections;
    
    connections.set(conn.key(), conn);
  }
  deleteConnection(conn: Connection) {
    const connections = this.connections;
      
    connections.delete(conn.key());
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
    
    if (context == null) 
      throw new Error(`AF: onNsConnect received for '${namespaceName}', but no context was available.`);
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
      this.logger, socket, context, methodContext, this.api);

    this.storeConnection(connection);
    socket.once('disconnect', 
      () => this.onDisconnect(connection));
    
    connection.registerCallbacks(socket);
  }
  
  // Called when the underlying socket-io socket disconnects.
  //
  onDisconnect(conn: Connection) {
    this.deleteConnection(conn);
  }
}

class NamespaceContext {
  user: User; 
  socketNs: SocketIO$Namespace;
  sink: MessageSink;
  
  natsSubscriber: ?NatsSubscriber; 
  
  constructor(
    user: User, socketNs: SocketIO$Namespace, sink: MessageSink
  ) {
    this.user = user; 
    this.socketNs = socketNs; 
    this.sink = sink; 
    
    this.natsSubscriber = null;
  }
  
  async open() {
    const sink = this.sink; 
    const userName = this.user.username;
    
    const natsSubscriber = new NatsSubscriber(
      'nats://127.0.0.1:4222', 
      sink);
          
    // We'll await this, since the user will want a connection that has
    // notifications turned on immediately. 
    await natsSubscriber.subscribe(userName);
    
    this.natsSubscriber = natsSubscriber;
  }
  
  // Closes down resources associated with this namespace context. 
  // 
  async close() {
    const natsSubscriber = this.natsSubscriber;

    if (natsSubscriber == null) return; 
    this.natsSubscriber = null; 
    
    await natsSubscriber.close(); 
  }
}


class Connection {
  socket: SocketIO$Socket; 
  namespaceContext: NamespaceContext;
  methodContext: MethodContext;
  api: API; 
  logger: Logger; 
  
  constructor(
    logger: Logger, 
    socket: SocketIO$Socket, 
    namespaceContext: NamespaceContext,
    methodContext: MethodContext, api: API
  ) {
    this.socket = socket; 
    this.namespaceContext = namespaceContext; 
    this.methodContext = methodContext;
    this.api = api; 
    this.logger = logger; 
  }
  
  // This should be used as a key when storing the connection inside a Map. 
  key(): string {
    return this.socket.id;
  }
  
  registerCallbacks(socket: SocketIO$Socket) {
    // Attach a few handlers to this socket. 
    socket.on('*', 
      (callData, callback) => this.onMethodCall(callData, callback));
    socket.once('disconnect', 
      () => this.onDisconnect());
  }
  
  // ------------------------------------------------------------ event handlers
  
  async onDisconnect() {
    const logger = this.logger; 
    const socket = this.socket; 
    const namespace = socket.namespace; 
    const connectionIds = Object.keys(namespace.sockets); 
    
    logger.info(`Namespace ${namespace.name}: socket disconnect (${connectionIds.length} conns remain).`);
    
    // Are we the last connected socket? (disconnect event fires before we're
    // removed from that array)
    if (connectionIds.length > 1) return; 
    if (connectionIds[0] !== socket.id) return; 
    
    // assert: We're the last connected socket in this namespace. 
    //         (connectionIds === [socket.id])

    logger.info(`Namespace ${namespace.name} closing down, cleaning up resources`); 

    // Deregister resources that we might have associated to the namespace. 
    await this.namespaceContext.close();
  }
  
  // Called when the socket wants to call a Pryv IO method. 
  // 
  async onMethodCall(callData: SocketIO$CallData, callback: (err: mixed, res: any) => mixed) {
    const api = this.api; 
    const logger = this.logger; 
    
    // Make sure that we have a callback here. 
    if (callback == null) callback = function(err: any) { }; // eslint-disable-line no-unused-vars
    
    const methodContext = this.methodContext;

    // FLOW MethodContext will need to be rewritten as a class...
    const userName = methodContext.username;   
    const method = callData.name; 
    const params = callData.args[0];
    
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