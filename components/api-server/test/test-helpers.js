// @flow

process.env.NODE_ENV = 'test';

process.on('unhandledRejection', unhandledRejection);

// Handles promise rejections that aren't caught somewhere. This is very useful
// for debugging. 
function unhandledRejection(reason, promise) {
  console.warn(                                // eslint-disable-line no-console
    'Unhandled promise rejection:', promise, 
    'reason:', reason.stack || reason); 
}

// Set up a context for spawning api-servers.
const { SpawnContext } = require('./helpers/spawner');
const context = new SpawnContext(); 
/* global after */
after(async () => {
  await context.shutdown(); 
});

module.exports = {
  context: context,
};