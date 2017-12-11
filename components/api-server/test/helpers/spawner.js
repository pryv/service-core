// @flow

const lodash = require('lodash');
const url = require('url');
const child_process = require('child_process');
const msgpack = require('msgpack5')();

const { ConditionVariable, Fuse } = require('./condition_variable');

// Set DEBUG=spawner to see these messages.
const debug = require('debug')('spawner');

const PRESPAWN_LIMIT = 2; 

// Spawns instances of api-server for tests. Listening port is chosen at random; 
// settings are either default or what you pass into the #spawn function. 
// 
class SpawnContext {
  basePort: number; 
  shuttingDown: boolean; 
  
  pool: Array<ProcessProxy>;
  allocated: Array<ProcessProxy>;
  
  constructor() {
    this.basePort = 3001;

    this.shuttingDown = false; 
    this.pool = []; 
    
    // All the processes that we've created and given to someone using
    // getProcess.
    this.allocated = [];
    
    this.prespawn(); 
  }
  
  // Prespawns processes up to PRESPAWN_LIMIT.
  //
  prespawn() {
    while (this.pool.length < PRESPAWN_LIMIT) {
      debug('Forking a new child...');
      
      const childProcess = child_process.fork('test/helpers/child_process');
      const proxy = new ProcessProxy(childProcess, this);
      
      this.pool.push(proxy);
    }
  }
  
  // Spawns a server instance. 
  //
  async spawn(): Promise<Server> {
    // Find a port to use
    // TODO Free ports once done.
    const port = this.allocatePort(); 
    
    // Obtain a process proxy
    const process = this.getProcess(); 
    
    // Create settings for this new instance.
    const settings = {
      http: {
        port: port,           // use this port for http/express
      },
      tcpMessaging: {
        enabled: false,       // disable axon messaging
      },
    };
    
    // Specialize the server we've started using the settings above.
    await process.startServer(settings);
    
    const baseUrl = `http://localhost:${port}/`;
    debug(`spawned a child at ${baseUrl}`);
    
    // Return to our caller - server should be up and answering at this point. 
    return new Server(baseUrl, process);
  }
  
  // Returns the next free port to use for testing. 
  //
  allocatePort(): number {
    // Simple strategy: Keep increasing port numbers. 
    const nextPort = this.basePort; 
    
    this.basePort += 1; 
    
    // If this fires, we might reconsider the simple implementation here. 
    if (this.basePort > 9000) throw new Error('AF: port numbers are <= 9000');
    
    return nextPort;
  }
  
  // Spawns and returns a process to use for testing. This will probably spawn
  // processes ahead of time in the background and return the next process from 
  // the internal prespawn pool. 
  // 
  getProcess(): ProcessProxy {
    this.prespawn();
    
    if (this.pool.length <= 0) throw new Error('AF: pool is not empty');
    
    const proxy = this.pool.shift(); 
    this.allocated.push(proxy);
    
    return proxy; 
  }
  
  // Spawns `n` instances at different listening ports. See #spawn.
  // 
  spawn_multi(n: number): Array<Promise<Server>> {
    if (n <= 0) throw new Error('AF: n expected to be > 0');
    
    return lodash.times(n, () => this.spawn());
  }
  
  // Called by the ProcessProxy when the child it is connected to exits. This 
  // exists to allow prespawning to catch up. 
  //
  onChildExit() {
    if (! this.shuttingDown) 
      this.prespawn();
  }
  
  // Call this when you want to stop all children at the end of the test suite. 
  //
  async shutdown() {
    debug('shutting down the context', this.pool.length);
    this.shuttingDown = true; 
    
    for (const child of this.pool) {
      await child.terminate();
    }
    
    for (const child of this.allocated) {
      await child.terminate();
    }
  }
}

// A proxy to the processes we launch. This class will care for the child
// processes and manage their lifecycle. It also provides a type-safe interface
// to messages that can be sent to the process. 
// 
class ProcessProxy {
  childProcess: child_process.ChildProcess; 
  pool: SpawnContext; 
  
  started: Fuse; 
  exited: Fuse; 
  
  constructor(childProcess: child_process.ChildProcess, pool: SpawnContext) {
    this.childProcess = childProcess;
    this.pool = pool; 
    
    this.started = new Fuse(); 
    this.exited = new Fuse(); 
    
    this.registerEvents(); 
  }
  
  registerEvents() {
    const child = this.childProcess;
    
    child.on('error', (err) => this.onChildError(err));
    child.on('exit', () => this.onChildExit());
    
    child.on('message', (wire) => this.dispatchChildMessage(wire));
  }
  
  dispatchChildMessage(wireMsg) {
    const [cmd, ...a] = msgpack.decode(wireMsg);
    
    switch(cmd) {
      case 'int_started': 
        this.onChildStarted();
        break; 
      default: 
        debug('received unknown message: ', cmd, a);
    }
  }
  
  onChildError(err: mixed) {
    debug(err);
  }
  onChildExit() {
    debug('child exited');
    this.exited.burn();
    
    this.pool.onChildExit();
  }
  
  onChildStarted() {
    debug('child started');
    this.started.burn(); 
  }
  
  // Starts the express/socket.io server with the settings given. 
  // 
  async startServer(settings: mixed): Promise<void> {
    this.sendToChild('int_startServer', settings);

    await this.started.wait(); 
    return;
  }
  
  // Terminates the associated child process; progressing from SIGTERM to SIGKILL. 
  // 
  async terminate(): Promise<mixed> {
    if (this.exited.isBurnt()) return; 
    
    const child = this.childProcess;

    debug('sending SIGTERM');
    child.kill('SIGTERM');
    try {
      await this.exited.wait(1000);
    }
    catch(err) {
      debug('sending SIGKILL');
      child.kill('SIGKILL');
      
      try {
        await this.exited.wait(1000);
      }
      catch(err) {
        debug('giving up, unkillable child');
      }
    }
  }
  
  sendToChild(msg: string, ...args: any) {
    const child = this.childProcess; 
    child.send(
      msgpack.encode([msg, ...args]));
  }
}

class Server {
  baseUrl: string; 
  process: ProcessProxy;
  
  constructor(baseUrl: string, proxy: ProcessProxy) {
    this.baseUrl = baseUrl;
    this.process = proxy; 
  }
  
  // Stops the server as soon as possible. Eventually returns either `true` (for
  // when the process could be stopped) or `false` for when the child could not
  // be terminated. 
  // 
  async stop(): Promise<boolean> {
    debug('stop called');
    try {
      debug('stopping child...');
      await this.process.terminate(); 
      debug('child stopped.');
      
      return true; 
    }
    catch (err) {
      return false; 
    }
  }
  
  url(path?: string): string {
    return new url.URL(path || '', this.baseUrl).toString();
  }
}

module.exports = {
  SpawnContext: SpawnContext,
  Server: Server, 
  ConditionVariable: ConditionVariable,
};