// @flow

const debug = require('debug')('child_process');
const msgpack = require('msgpack5')();
const bluebird = require('bluebird');

const Application = require('../../src/application');
const Settings = require('../../src/settings');
const { InfluxRowType, TypeRepository } = require('components/business').types;

import type {MetadataRepository} from '../../src/metadata_cache';

const typeRepo = new TypeRepository(); 

// This bit is useful to trace down promise rejections that aren't caught. 
//
process.on('unhandledRejection', unhandledRejection);

// Receives messages from the parent (spawner.js) and dispatches them to the 
// handler functions below. 
//
process.on('message', handleParentMessage);

// The HFS application object that the tests interact with. 
let app; 

// Gets called by the test process to mock out authentication and allow everyone
// access. 
// 
function mockAuthentication(allowAll: boolean) {
  const context = app.context; 
  
  context.metadata = produceMetadataLoader(allowAll);
}
function produceMetadataLoader(authTokenValid=true): MetadataRepository {
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

async function intStartServer(injectSettings: {}) {
  const settings = new Settings(); 
  settings.loadFromFile('config/dev.json');
  settings.loadFromObject(injectSettings);
  
  debug(settings.get('http.port').num());
  
  app = new Application();
  app.init(settings);
  app.start(); 
}

async function handleParentMessage(wireMessage: Buffer) {
  const message = msgpack.decode(wireMessage);
  
  const [msgId, cmd, ...args] = message; 
  debug('handleParentMessage/received ', msgId, cmd, args);
  
  try {
    let ret = await dispatchParentMessage(cmd, ...args);
    
    // msgpack cannot encode undefined.
    if (ret === undefined) ret = null; 
    
    respondToParent(['ok', msgId, cmd, ret]);
  }
  catch (err) {
    debug('handleParentMessage/catch', err.message);
    respondToParent(['err', msgId, cmd, err]);
  }
    
  debug('handleParentMessage/done', cmd);
}
function respondToParent(msg: Array<mixed>) {
  debug('respondToParent', msg);
  
  // FLOW Somehow flow-type doesn't know about process here. 
  process.send(
    msgpack.encode(msg));
}
function dispatchParentMessage(cmd, ...args) {
  switch(cmd) {
    case 'mockAuthentication': 
      return mockAuthentication(args[0]);
    case 'int_startServer': 
      return intStartServer(args[0]);
    
    default: 
      throw new Error(`Unknown/unhandled message ${cmd}`);
  }
}

// Handles promise rejections that aren't caught somewhere. This is very useful
// for debugging. 
function unhandledRejection(reason, promise) {
  console.warn(                                // eslint-disable-line no-console
    'Unhandled promise rejection:', promise, 
    'reason:', reason.stack || reason); 
}

// Keeps the event loop busy. This is what the child does as long as it is not 
// serving requests. 
//
function work() {
  setTimeout(work, 10000);
}
work(); 
