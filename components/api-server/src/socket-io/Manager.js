// @flow

const errorHandling = require('components/errors').errorHandling;
const setCommonMeta = require('../methods/helpers/setCommonMeta');
const bluebird = require('bluebird');
const NATS_CONNECTION_URI = require('components/utils').messaging.NATS_CONNECTION_URI;

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

// Manages contexts for socket-io. NamespaceContext's are created when the first
// client connects to a namespace and are then kept forever.  
// 
class Manager implements MessageSink {
  contexts: Map<string, NamespaceContext>; 
  
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
    
    // assert: context == null
    // Value is missing, produce it. 
    context = missingCb();

    contexts.set(namespaceName, context);
    return context; 
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
    const sink: MessageSink = this; 
    
    const ctx = new NamespaceContext(
      user, 
      io, socketNs, 
      this.api, 
      sink, logger);
      
    ctx.init(); 

    return ctx; 
  }
    
  // Given a `userName` and a `message`, delivers the `message` as a socket.io
  // event to all clients currently connected to the namespace '/USERNAME'.
  // 
  // Part of the MessageSink implementation.
  //
  deliver(userName: string, message: string | {}): void {
    const context = this.getContext(`/${userName}`);
    if (context == null) return; 
    
    const namespace = context.socketNs;
    if (namespace == null) 
      throw new Error('AF: namespace should not be null');
    
    if (typeof message === 'object') {
      message = JSON.stringify(message);
    }

    namespace.emit(message);
  }
}

class NamespaceContext {
  user: User; 
  socketServer: SocketIO$Server;
  socketNs: SocketIO$Namespace;
  api: API; 
  sink: MessageSink;
  logger: Logger; 
  
  connections: Map<SocketIO$SocketId, Connection>; 
  natsSubscriber: ?NatsSubscriber; 
  
  constructor(
    user: User, 
    socketServer: SocketIO$Server, socketNs: SocketIO$Namespace, 
    api: API, 
    sink: MessageSink, 
    logger: Logger
  ) {
    this.user = user; 
    this.socketServer = socketServer;
    this.socketNs = socketNs; 
    this.api = api; 
    this.sink = sink; 
    this.logger = logger; 

    this.connections = new Map(); 
    this.natsSubscriber = null;
  }
    
  // Registers callbacks that we need for the context to operate. This happens
  // only once, when the namespace gets its first connection - after that, 
  // namespaces are cached. 
  // 
  init() {
    const logger = this.logger; 
    const socketNs = this.socketNs;
    const namespaceName = this.socketNs.name;
    
    logger.debug(`Initializing namespace '${namespaceName}'`);
    socketNs.on('connection', 
      (socket: SocketIO$Socket) => this.onConnect(socket));
  }

  // Adds a connection to the namespace. This produces a `Connection` instance 
  // and stores it in (our) namespace. 
  // 
  addConnection(socket: SocketIO$Socket, methodContext: MethodContext) {    
    // This will represent state that we keep for every connection. 
    const connection = new Connection(
      this.logger, socket, this, methodContext, this.api);

    // Permanently store the connection in this namespace.
    this.storeConnection(connection);
    socket.once('disconnect', 
      () => this.onDisconnect(connection));
    
    connection.init();
  }
  storeConnection(conn: Connection) {
    const connMap = this.connections;
    connMap.set(conn.key(), conn);
  }
  deleteConnection(conn: Connection) {
    const connMap = this.connections;
    connMap.delete(conn.key());
  }
  
  async open() {
    // If we've already got an active subscription, leave it be. 
    if (this.natsSubscriber != null) return; 
    this.natsSubscriber = await this.produceNatsSubscriber();
  }
  async produceNatsSubscriber(): Promise<NatsSubscriber> {
    const sink: MessageSink = this.sink; 
    const userName = this.user.username;

    const natsSubscriber = new NatsSubscriber(
      NATS_CONNECTION_URI, 
      sink,
      (username: string): string => {
        return `${username}.sok1`;
      }
    );
          
    // We'll await this, since the user will want a connection that has
    // notifications turned on immediately. 
    await natsSubscriber.subscribe(userName);
    
    return natsSubscriber;
  }
  
  // Closes down resources associated with this namespace context. 
  // 
  async close() {
    const natsSubscriber = this.natsSubscriber;

    if (natsSubscriber == null) return; 
    this.natsSubscriber = null; 
    
    await natsSubscriber.close(); 
  }

  // ------------------------------------------------------------ event handlers
  
  // Called when a new socket connects to the namespace `socketNs`.
  // 
  onConnect(socket: SocketIO$Socket) {
    const logger = this.logger; 
    const io = this.socketServer; 
    
    const namespaceName = socket.namespace.name;
    
    logger.info(`New client connected on namespace '${namespaceName}' (context ${this.socketNs.name})`);
        
    // Extract the methodContext from the handshake: 
    const socketHandshake = io.handshaken[socket.id];
    // FLOW This is attached to the handshake by our authorizeUserMiddleware.
    const methodContext = socketHandshake.methodContext; 
    
    if (methodContext == null) {
      logger.warn('AF: onNsConnect received handshake w/o method context.');
      return; 
    }
    
    this.addConnection(socket, methodContext);  
  }

  // Called when the underlying socket-io socket disconnects.
  //
  async onDisconnect(conn: Connection) {
    const logger = this.logger; 
    const namespace = this.socketNs;

    // Remove the connection from our connection list. 
    this.deleteConnection(conn);

    const remaining = this.connections.size;
    logger.info(`Namespace ${namespace.name}: socket disconnect (${remaining} conns remain).`);

    if (remaining > 0) return; 
    // assert: We're the last connected socket in this namespace. 

    logger.info(`Namespace ${namespace.name} closing down, cleaning up resources`); 

    // Namespace doesn't have any connections left, stop notifying. We'll reopen
    // this when the next socket connects.
    await this.close(); 
  }
}


class Connection {
  socket: SocketIO$Socket; 
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
    this.methodContext = methodContext;
    this.api = api; 
    this.logger = logger; 
  }
  
  // This should be used as a key when storing the connection inside a Map. 
  key(): string {
    return this.socket.id;
  }
  
  init() {
    const socket = this.socket; 
    
    // Attach a few handlers to this socket. 
    socket.on('*', 
      (callData, callback) => this.onMethodCall(callData, callback));
  }
  
  // ------------------------------------------------------------ event handlers
  
  // Called when the socket wants to call a Pryv IO method. 
  // 
  async onMethodCall(callData: SocketIO$CallData, callback: (err: mixed, res: any) => mixed) {
    const api = this.api; 
    const logger = this.logger; 
    
    // Make sure that we have a callback here. 
    if (callback == null) callback = function(err: any, res: any) { }; // eslint-disable-line no-unused-vars
    
    const methodContext = this.methodContext;

    // FLOW MethodContext will need to be rewritten as a class...
    const userName = methodContext.username;   
    const method = callData.name; 
    const params = callData.args[0];
    
    const answer = bluebird.fromCallback(
      (cb) => api.call(method, methodContext, params, cb));
      
    try {
      const result = await answer; 
      
      if (result == null) 
        throw new Error('AF: either err or result must be non-null');
      
      const obj = await bluebird.fromCallback(
        (cb) => result.toObject(cb));
        
      return callback(null, setCommonMeta(obj));
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