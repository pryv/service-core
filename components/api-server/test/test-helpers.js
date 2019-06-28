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
const { SpawnContext } = require('components/test-helpers').spawner;
const context: SpawnContext = new SpawnContext(); 
/* global after */
after(async () => {
  await context.shutdown(); 
});

const { Database } = require('components/storage');
const Settings = require('../src/settings');
const NullLogger = require('components/utils/src/logging').NullLogger;

// Produces and returns a connection to MongoDB. 
// 
async function produceMongoConnection(): Promise<Database> {
  const settings = await Settings.load();
  const database = new Database(
    settings.get('database').obj(), 
    new NullLogger()); 
  
  return database; 
}

module.exports = {
  context,                // the spawn context for manipulating child instances
  produceMongoConnection, // for using fixtures
};