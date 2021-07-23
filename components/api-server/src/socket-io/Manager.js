/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const errorHandling = require('errors').errorHandling;
const commonMeta = require('../methods/helpers/setCommonMeta');
const bluebird = require('bluebird');
const NATS_CONNECTION_URI = require('messages').NATS_CONNECTION_URI;
const { USERNAME_REGEXP_STR } = require('../schema/helpers');

(async () => {
  await commonMeta.loadSettings();
})();

const { getAPIVersion } = require('middleware/src/project_version');
const { initRootSpan, setErrorToTracingSpan } = require('tracing');

const MethodContext = require('business').MethodContext;
import type API  from '../API';

import type { MessageSink }  from 'messages';
import type { StorageLayer } from 'storage';

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

// Manages contexts for socket-io. NamespaceContext's are created when the first
// client connects to a namespace and are then kept forever.  
// 
class Manager implements MessageSink {
  contexts: Map<string, NamespaceContext>; 
  
  logger; 
  io: SocketIO$Server; 
  api: API; 
  storageLayer: StorageLayer;
  customAuthStepFn: Object;
  isOpenSource: boolean;
  apiVersion: string;
  hostname: string;

  constructor(
    logger, io: SocketIO$Server, api: API, storageLayer: StorageLayer, customAuthStepFn: Object,
    isOpenSource: boolean,
  ) {
    this.logger = logger; 
    this.io = io; 
    this.api = api; 
    this.isOpenSource = isOpenSource;
    this.contexts = new Map(); 
    this.storageLayer = storageLayer;
    this.customAuthStepFn = customAuthStepFn;
    this.hostname = require('os').hostname();
  }
  
  // Returns true if the `candidate` could be a username on a lexical level. 
  // 
  looksLikeUsername(candidate: string): boolean {
    const reUsername = new RegExp(USERNAME_REGEXP_STR); 
    const lowercasedUsername = candidate.toLowerCase(); // for retro-compatibility
    return reUsername.test(lowercasedUsername);
  }

  // Extracts the username from the given valid namespace name.
  // Returns null if the given `namespaceName` cannot be parsed as a user name. 
  // 
  //    manager.getUsername('/foobar') // => 'foobar'
  //
  extractUsername(namespaceName: string): ?string {
    const ns: string = cleanNS(namespaceName);
    if (!ns.startsWith('/')) return null; 
  
    // assert: namespaceName[0] === '/'
    const candidate = ns.slice(1);
      
    if (! this.looksLikeUsername(candidate)) return null; 
    
    return candidate;

      /**
     * Takes the last field of the NS path
     * 
     * @param {*} namespace 
     */
    function cleanNS(namespace: string): string {
      let cleaned = '' + namespace;
      // remove eventual trailing "/"
      if (cleaned.slice(-1) === '/') cleaned = cleaned.slice(0, -1);
      // get last element of path
      const s = cleaned.lastIndexOf('/');
      if (s > 0) {
        cleaned = cleaned.slice(s);
      }
      return cleaned;
    }
  }
  
  async ensureInitNamespace(namespaceName: string): Promise<NamespaceContext> {  
    
    await initAsyncProps.call(this);

    let username = this.extractUsername(namespaceName);
    let context = this.contexts.get(username);
    // Value is not missing, return it. 
    if (typeof context === 'undefined') {

      const sink: MessageSink = this;

      context = new NamespaceContext(
        username,
        this.io.of(namespaceName), 
        this.api,
        sink,
        this.logger,
        this.isOpenSource,
        this.apiVersion,
        this.hostname,
      );

      this.contexts.set(username, context);
    }  
    await context.open();
    return context;

    /**
     * putting this here because putting it above requires rendering too much code async. I'm sorry.
     */
    async function initAsyncProps() {
      if (this.apiVersion == null) this.apiVersion = await getAPIVersion();
    }
  }
    
  // Given a `userName` and a `message`, delivers the `message` as a socket.io
  // event to all clients currently connected to the namespace '/USERNAME'.
  // 
  // Part of the MessageSink implementation.
  //
  deliver(userName: string, message: string | {}): void {
    const context = this.contexts.get(userName);
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
  namespaceName: string;
  username: string; 
  socketNs: SocketIO$Namespace;
  api: API; 
  sink: MessageSink;
  logger; 
  apiVersion: string;
  hostname: string;
  
  connections: Map<SocketIO$SocketId, Connection>; 
  natsSubscriber: ?NatsSubscriber; 
  
  constructor(
    username: string, 
    socketNs: SocketIO$Namespace, 
    api: API, 
    sink: MessageSink, 
    logger,
    isOpenSource: Boolean,
    apiVersion: string,
    hostname: string,
  ) {
    this.username = username; 
    this.socketNs = socketNs; 
    this.api = api; 
    this.sink = sink; 
    this.logger = logger; 
    this.isOpenSource = isOpenSource;
    this.connections = new Map(); 
    this.natsSubscriber = null;
    this.apiVersion = apiVersion;
    this.hostname = hostname;
  }
    

  // Adds a connection to the namespace. This produces a `Connection` instance 
  // and stores it in (our) namespace. 
  // 
  addConnection(socket: SocketIO$Socket) {  
    // This will represent state that we keep for every connection. 
    const connection = new Connection(
      this.logger, socket, this, socket.methodContext, this.api,
      this.apiVersion, this.hostname,
    );

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
    if (this.natsSubscriber != null || this.isOpenSource) return; 
    this.natsSubscriber = await this.produceNatsSubscriber();
  }
  async produceNatsSubscriber(): Promise<NatsSubscriber> {
    const sink: MessageSink = this.sink; 
    const userName = this.username;
    const { NatsSubscriber } = require('messages');
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
    
    const namespaceName = socket.nsp.name;
    
    logger.info(`New client connected on namespace '${namespaceName}' (context ${this.socketNs.name})`);
    
    // FLOW This is attached to the socket by our initUsersNameSpaces.
    const methodContext = socket.methodContext; 
    
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
  logger; 
  apiVersion: string;
  hostname: string;
  
  constructor(
    logger, 
    socket: SocketIO$Socket, 
    namespaceContext: NamespaceContext,
    methodContext: MethodContext, api: API,
    apiVersion: string, hostname: string,
  ) {
    this.socket = socket; 
    this.methodContext = methodContext;
    this.api = api; 
    this.logger = logger; 
    this.apiVersion = apiVersion;
    this.hostname = hostname;
  }
  
  // This should be used as a key when storing the connection inside a Map. 
  key(): string {
    return this.socket.id;
  }
  
  init() {
    this.socket.on('*', (callData, callback) => this.onMethodCall(callData, callback));
  }
  
  // ------------------------------------------------------------ event handlers
  
  // Called when the socket wants to call a Pryv IO method. 
  // 
  async onMethodCall(callData: SocketIO$CallData, callback: (err: mixed, res: any) => mixed) {

    const methodContext = this.methodContext;

    methodContext.tracing = initRootSpan('socket.io', {
      apiVersion: this.apiVersion,
      hostname: this.hostname,
    });

    const api = this.api; 
    const logger = this.logger;
    
    if (! callData || ! callData.data || callData.data.length != 3) {
      if (callback) { 
        callback(new Error("invalid data"));
      }
      return;
    }
    const apiMethod = callData.data[0];
    const params = callData.data[1];
    callback = callback || callData.data[2];
    //if (callback == null) callback = function (err: any, res: any) { }; // eslint-disable-line no-unused-vars

    methodContext.methodId = apiMethod;
    
    // FLOW MethodContext will need to be rewritten as a class...
    const userName = methodContext.username;   

    // Accept streamQueries in JSON format for socket.io
    methodContext.acceptStreamsQueryNonStringified = true;
      
    try {
      const result = await bluebird.fromCallback(
        (cb) => api.call(methodContext, params, cb));; 
      
      if (result == null) 
        throw new Error('AF: either err or result must be non-null');
      
      const obj = await bluebird.fromCallback(
        (cb) => result.toObject(cb));
        
      // good ending
      methodContext.tracing.finishSpan('socket.io');
      
      return callback(null, commonMeta.setCommonMeta(obj));
    }
    catch (err) {
      errorHandling.logError(err, {
        url: `socketIO/${userName}`,
        method: apiMethod,
        body: params
      }, logger);

      // bad ending
      setErrorToTracingSpan('socket.io', err, methodContext.tracing);
      methodContext.tracing.finishSpan('socket.io');

      return callback(
        commonMeta.setCommonMeta({ error: errorHandling.getPublicErrorData(err) }));
    }
    // NOT REACHED
  }
}

module.exports = Manager; 
