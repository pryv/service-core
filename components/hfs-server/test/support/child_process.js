// @flow

const debug = require('debug')('test-child');
const msgpack = require('msgpack5')();

const Application = require('../../src/application');
const Settings = require('../../src/settings');

// This bit is useful to trace down promise rejections that aren't caught. 
//
process.on('unhandledRejection', unhandledRejection);

// Receives messages from the parent (spawner.js) and dispatches them to the 
// handler functions below. 
//
process.on('message', dispatchParentMessage);

async function intStartServer(injectSettings: {}) {
  debug(injectSettings);
  
  const settings = new Settings(); 
  const app = new Application();
  app.init(settings);
  app.start(); 
  
  sendToParent('int_started');
}

function dispatchParentMessage(wireMessage: Buffer) {
  const message = msgpack.decode(wireMessage);
  
  const [cmd, ...args] = message; 
  debug('received ', cmd, args);
  
  switch(cmd) {
    case 'int_startServer': 
      intStartServer(args[0]); 
      break; 
    default: 
      throw new Error(
        `Child has received unknown message, ignoring... (${cmd})`);
  }
  
  debug('done', cmd);
}

// Helper function to answer something to the parent. This is the counterpart
// to 'dispatchParentMessage' above. 
function sendToParent(cmd, ...args) {
  // FLOW Somehow flow-type doesn't know about process here. 
  process.send(
    msgpack.encode([cmd, ...args]));
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
