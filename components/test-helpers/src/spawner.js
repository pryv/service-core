// @flow

const url = require('url');
const child_process = require('child_process');
const net = require('net');
const EventEmitter = require('events');

const axon = require('axon');
const lodash = require('lodash');
const msgpack = require('msgpack5')();
const bluebird = require('bluebird');
const supertest = require('supertest');
const _ = require('lodash');

const { ConditionVariable, Fuse } = require('./condition_variable');

// Set DEBUG=spawner to see these messages.
const debug = require('debug')('spawner');

const PRESPAWN_LIMIT = 2;

let basePort = 3001;

let debugPortCount = 1;

// Spawns instances of api-server for tests. Listening port is chosen at random;
// settings are either default or what you pass into the #spawn function.
//
class SpawnContext {
  childPath: string;

  basePort: number; // used for HTTP server and Axon server

  shuttingDown: boolean;

  pool: Array<ProcessProxy>;

  allocated: Array<ProcessProxy>;

  // Construct a spawn context. `childPath` should be a module require path to
  // the module that will be launched in the child process. Please see
  // components/api-server/test/helpers/child_process for an example of such
  // a module.
  //

  constructor(childPath: string = `${__dirname}/../../api-server/test/helpers/child_process`) {
    this.childPath = childPath;
    this.basePort = basePort;
    basePort += 10;

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
    const { childPath } = this;

    while (this.pool.length < PRESPAWN_LIMIT) {
      debug('prespawn process');
      const newArgv = process.execArgv.map((arg) => {
        if (arg.startsWith('--inspect-brk=')) {
          return `--inspect-brk=${Number(arg.split('=')[1]) + debugPortCount++}`;
        }
        return arg;
      });
      const childProcess = child_process.fork(childPath, null, { execArgv: newArgv });
      const proxy = new ProcessProxy(childProcess, this);

      debug(`prespawned child pid ${childProcess.pid}`);

      this.pool.push(proxy);
    }
  }

  // Spawns a server instance.
  //
  async spawn(customSettings: Object): Promise<Server> {
    // If by any chance we exhausted our processes really quickly, make
    // sure to spawn a few now.
    if (this.pool.length <= 0) this.prespawn();

    // Find a port to use
    // TODO Free ports once done.
    const port = await this.allocatePort();

    const axonPort = await this.allocatePort();

    // Obtain a process proxy
    const process = this.getProcess();

    // Create settings for this new instance.
    customSettings = customSettings || {};
    const settings = _.merge({
      http: {
        port, // use this port for http/express
      },
      tcpMessaging: {
        enabled: true,
        // for spawner, we boot api-servers before their Server holder objects
        // so the api-server needs to listen on a socket before Server facade
        // connects to it. It's the inverse for InstanceManager
        pubConnectInsteadOfBind: false,
        port: axonPort,
        host: 'localhost',
      },
    }, customSettings);

    // Specialize the server we've started using the settings above.
    await process.startServer(settings);

    debug(`spawned a child on port ${port}`);

    // Return to our caller - server should be up and answering at this point.
    return new Server(port, process, axonPort);
  }

  // Returns the next free port to use for testing.
  //
  async allocatePort(): Promise<number> {
    // Infinite loop, see below for exits.
    while (true) { // eslint-disable-line no-constant-condition
      // Simple strategy: Keep increasing port numbers.
      const nextPort = this.basePort;
      this.basePort += 1;

      // Exit 1: If this fires, we might reconsider the simple implementation
      // here.
      if (this.basePort > 9000) { throw new Error('AF: port numbers are <= 9000'); }

      // Exit 2: If we can bind to the port, return it for our next child
      // process.
      if (await tryBindPort(nextPort)) return nextPort;
    }

    // Tell flow not to worry about returns from this execution path.
    throw new Error('AF: NOT REACHED'); // eslint-disable-line no-unreachable

    // Returns true if this process can bind a listener to the `port` given.
    // Closes the port immediately after calling `listen()` so that a child
    // can reuse the port number.
    //
    async function tryBindPort(port: number): Promise<boolean> {
      const server = net.createServer();

      debug('Trying future child port', port);
      return new bluebird((res, rej) => {
        try {
          server.on('error', (err) => {
            debug('Future child port unavailable: ', err);
            server.close();
            res(false);
          });

          const host = '0.0.0.0';
          const backlog = 511; // default
          server.listen(port, host, backlog, () => {
            server.close();
            res(true);
          });
        } catch (err) {
          debug('Synchronous exception while looking for a future child port: ', err);
          rej(err);
        }
      });
    }
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
    if (!this.shuttingDown) { this.prespawn(); }
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

opaque type MessageId = number;
type ResolveFun = (val: mixed) => void;
type RejectFun = (err: Error) => void;
opaque type Resolver = {
  resolve: ResolveFun,
  reject: RejectFun,
};

// A proxy to the processes we launch. This class will care for the child
// processes and manage their lifecycle. It also provides a type-safe interface
// to messages that can be sent to the process.
//
class ProcessProxy {
  childProcess: child_process.ChildProcess;

  pool: SpawnContext;

  started: Fuse;

  exited: Fuse;

  pendingMessages: Map<MessageId, Resolver>;

  constructor(childProcess: child_process.ChildProcess, pool: SpawnContext) {
    this.childProcess = childProcess;
    this.pool = pool;

    this.started = new Fuse();
    this.exited = new Fuse();

    this.pendingMessages = new Map();

    this.registerEvents();
  }

  registerEvents() {
    const child = this.childProcess;

    child.on('error', (err) => this.onChildError(err));
    child.on('exit', () => this.onChildExit());

    child.on('message', (wire) => this.dispatchChildMessage(wire));
  }

  dispatchChildMessage(wireMsg) {
    const { pendingMessages } = this;
    const [status, msgId, cmd, retOrErr] = msgpack.decode(wireMsg);

    debug('dispatchChildMessage/msg', status, msgId, cmd, retOrErr);

    if (!pendingMessages.has(msgId)) throw new Error(`Received client process message (${msgId}/${cmd}) without counterpart.`);

    const resolver = pendingMessages.get(msgId);
    if (resolver == null) throw new Error('AF: No pending message exists');

    switch (status) {
      case 'ok':
        resolver.resolve(retOrErr);
        break;

      case 'err':
        resolver.reject(new Error(`Remote exception: ${retOrErr}`));
        break;

      default:
        throw new Error(`Invalid status value '${status}'`);
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

  // Starts the express/socket.io server with the settings given.
  //
  async startServer(settings: mixed): Promise<void> {
    if (this.exited.isBurnt()) throw new Error('Child exited prematurely; please check your setup code.');

    await this.sendToChild('int_startServer', settings);

    debug('child started');
    this.started.burn();
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
    } catch (err) {
      debug('sending SIGKILL');
      child.kill('SIGKILL');

      try {
        await this.exited.wait(1000);
      } catch (err) {
        debug('giving up, unkillable child');
      }
    }
  }

  sendToChild(msg: string, ...args: any): Promise<mixed> {
    return new bluebird((resolve, reject) => {
      const child = this.childProcess;

      const msgId = this.createPendingMessage(resolve, reject);

      // This is where things get async - the child will answer whenever it
      // likes.  The answer is handled by dispatchChildMessage.
      child.send(
        msgpack.encode([msgId, msg, ...args]),
      );
    });
  }

  createPendingMessage(res: ResolveFun, rej: RejectFun): MessageId {
    let remainingTries = 1000;
    const { pendingMessages } = this;
    const resolver = {
      resolve: res,
      reject: rej,
    };

    while (remainingTries > 0) {
      const candId: MessageId = Math.floor(Math.random() * 1e9);

      if (!pendingMessages.has(candId)) {
        pendingMessages.set(candId, resolver);

        // Success return.
        return candId;
      }

      remainingTries -= 1;
    }

    // assert: We haven't found a free message id in 1000 tries.. give up.
    throw new Error('AF: Could not find a free message id.');
  }
}

// Public facade to the servers we spawn.
//
class Server extends EventEmitter {
  port: number;

  axonPort: number;

  baseUrl: string;

  process: ProcessProxy;

  messagingSocket: mixed;

  host: string;

  constructor(port: number, proxy: ProcessProxy, axonPort: number) {
    super();
    this.port = port;
    this.axonPort = axonPort;
    this.host = 'localhost';
    this.baseUrl = `http://${this.host}:${port}`;
    this.process = proxy;
    this.listen();
  }

  listen(): void {
    const { host } = this;
    this.messagingSocket = axon.socket('sub-emitter');
    const mSocket = this.messagingSocket;
    mSocket.connect(+this.axonPort, host);

    mSocket.on('*', (message, data) => {
      this.emit(message, data);
    });
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
    } catch (err) {
      return false;
    }
  }

  url(path?: string): string {
    return new url.URL(path || '', this.baseUrl).toString();
  }

  request(newUrl?: string) {
    return supertest(newUrl || this.baseUrl);
  }
}

module.exports = {
  SpawnContext,
  Server,
  ConditionVariable,
};
