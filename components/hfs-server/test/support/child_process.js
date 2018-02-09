// @flow

const debug = require('debug')('child_process');
const msgpack = require('msgpack5')();
const bluebird = require('bluebird');

const Application = require('../../src/application');
const Settings = require('../../src/settings');
const { InfluxRowType, TypeRepository } = require('components/business').types;

import type {MetadataRepository} from '../../src/metadata_cache';

const typeRepo = new TypeRepository(); 

class ChildProcess {
  launcher: Object; 
  
  constructor(launcher) {
    this.launcher = launcher;
    
    // This bit is useful to trace down promise rejections that aren't caught. 
    //
    process.on('unhandledRejection', 
      (...a) => this.unhandledRejection(...a));
      
    // Receives messages from the parent (spawner.js) and dispatches them to the 
    // handler functions below. 
    //
    process.on('message', 
      (...a) => this.handleParentMessage(...a));
  }

  // Handles promise rejections that aren't caught somewhere. This is very
  // useful for debugging. 
  unhandledRejection(reason, promise) {
    console.warn(                                // eslint-disable-line no-console
      'Unhandled promise rejection:', promise, 
      'reason:', reason.stack || reason); 
  }
  
  async handleParentMessage(wireMessage: Buffer) {
    const message = msgpack.decode(wireMessage);
    
    const [msgId, cmd, ...args] = message; 
    debug('handleParentMessage/received ', msgId, cmd, args);
    
    try {
      let ret = await this.dispatchParentMessage(cmd, ...args);
      
      // msgpack cannot encode undefined.
      if (ret === undefined) ret = null; 
      
      this.respondToParent(['ok', msgId, cmd, ret]);
    }
    catch (err) {
      debug('handleParentMessage/catch', err.message);
      this.respondToParent(['err', msgId, cmd, err]);
    }
      
    debug('handleParentMessage/done', cmd);
  }
  respondToParent(msg: Array<mixed>) {
    debug('respondToParent', msg);
    
    // FLOW Somehow flow-type doesn't know about process here. 
    process.send(
      msgpack.encode(msg));
  }
  dispatchParentMessage(cmd: string, ...args) {
    if (! cmd.startsWith('int_')) {
      const launcher = this.launcher;
      
      if (typeof launcher[cmd] !== 'function')
        throw new Error(`Unknown/unhandled launcher message ${cmd}`);
        
      return launcher[cmd](...args);
    }

    // assert: cmd.startsWith('int_')
    switch(cmd) {
      case 'int_startServer': 
        return this.intStartServer(args[0]);
      
      default: 
        throw new Error(`Unknown/unhandled internal message ${cmd}`);
    }
  }
  
  // ----------------------------------------------------------- parent messages
  
  // Tells the launcher to launch the application, injecting the given
  // `injectSettings`.
  // 
  async intStartServer(injectSettings: {}) {
    const launcher = this.launcher;
    
    launcher.launch(injectSettings);
  }
  
  // Main method to launch the child process.
  // 
  run() {
    // // Keeps the event loop busy. This is what the child does as long as it is not 
    // // serving requests. 
    // //
    // function work() {
    //   setTimeout(work, 10000);
    // }
    // work(); 
  }
}

class ApplicationLauncher {
  app: ?Application; 
  
  constructor() {
    this.app = null; 
  }
  
  // Gets called by the test process to mock out authentication and allow everyone
  // access. 
  // 
  mockAuthentication(allowAll: boolean) {
    const app = this.app; 
    if (app == null) throw new Error('AF: app should not be null anymore');
    
    const context = app.context; 
    
    context.metadata = this.produceMetadataLoader(allowAll);
  }
  produceMetadataLoader(authTokenValid=true): MetadataRepository {
    const seriesMeta = {
      canWrite: () => authTokenValid,
      canRead: () => authTokenValid, 
      namespace: () => ['test', 'foo'],
      produceRowType: () => new InfluxRowType(typeRepo.lookup('mass/kg')),
    };
    return {
      forSeries: function forSeries() { return bluebird.resolve(seriesMeta); }
    };
  }

  launch(injectSettings: {}) {
    const settings = new Settings(); 
    settings.loadFromFile('config/dev.json');
    settings.loadFromObject(injectSettings);
    
    debug(settings.get('http.port').num());
    
    const app = this.app = new Application();
    app.init(settings);
    app.start(); 
  }
}

const appLauncher = new ApplicationLauncher(); 
const childProcess = new ChildProcess(appLauncher);
childProcess.run();
