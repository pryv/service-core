// @flow

const process = require('process');
const debug = require('debug')('test-child');
const msgpack = require('msgpack5')();

const config = require('../../src/config');
const Server = require('../../src/server');

process.on('message', (wireMessage) => {
  const message = msgpack.decode(wireMessage);
  debug('received ', message);
  
  const [cmd, ...args] = message; 
  switch(cmd) {
    case 'int_startServer': 
      intStartServer(args[0]); 
      break; 
  }
});

async function intStartServer(settings: mixed) {
  const server = new Server(); 
  await server.start(); 
  
  sendToParent('int_started');
}

function sendToParent(cmd, ...args) {
  process.send(
    msgpack.encode([cmd, ...args]));
}

function work() {
  setTimeout(work, 1000);
}

work(); 
