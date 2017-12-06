// @flow

const process = require('process');
const debug = require('debug')('test-child');
const msgpack = require('msgpack5')();

debug('hi from child');

process.on('message', (wireMessage) => {
  const message = msgpack.decode(wireMessage);
  debug('received ', message);
  
  const [cmd, ...args] = message; 
  switch(cmd) {
    case 'int_startServer': 
      sendToParent('int_started');
      break; 
  }
});
function sendToParent(cmd, ...args) {
  process.send(
    msgpack.encode([cmd, ...args]));
}

function work() {
  setTimeout(work, 1000);
}

work(); 
