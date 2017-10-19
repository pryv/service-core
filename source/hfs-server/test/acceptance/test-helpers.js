// @flow

// Test helpers for all acceptance tests. 

const NullLogger = require('components/utils/src/logging').NullLogger;
const storage = require('components/storage');
const business = require('components/business');

const toplevelHelpers = require('../test-helpers');

// Produces and returns a connection to InfluxDB. 
// 
function produceInfluxConnection(): business.series.InfluxConnection {
  const logger = new NullLogger(); 
  
  return new business.series.InfluxConnection(
    {host: 'localhost'}, logger); 
}
exports.produceInfluxConnection = produceInfluxConnection;

// Produces and returns a connection to MongoDB. 
// 
function produceMongoConnection(): storage.Database {
  const settings = toplevelHelpers.settings;
  const loggingStub = {
    getLogger: () => new NullLogger(), 
  };
  const database = new storage.Database(
    settings.get('mongodb').obj(), 
    loggingStub); 
  
  return database; 
}
exports.produceMongoConnection = produceMongoConnection;

interface Suite {
  beforeEach(() => mixed): void;
}

// Define a value that should be reset for each test execution (each 'it' in
// your mocha suite). 
// 
// Example: 
//    const foo = define(this, () => {
//      return bluebird.resolve(true)
//    });
// 
// After the above example, `foo` will contain a function that, when called, 
// returns true. The block given to `define` is executed for each 'it' in your 
// test suite (`this`) - for isolation. 
// 
// We chose to have the define function to return a promise here since the
// beforeEach of mocha must wait on the value to be available. 
//  
function define<T>(suite: Suite, generator: () => (Promise<T> | T)): () => T {
  let value: ?T = null; 
  
  suite.beforeEach(() => {
    // Since flow will not be able to know what value we're treating here, let's
    // give it a hint: 
    const futureValue: any = (generator(): any); 

    if (futureValue.then != null) {
      // If generator returned a promise, return it so that mocha awaits it. 
      // Also, once the value becomes available (after this awaiting), have 
      // value contain it. 
      // 
      return futureValue.then((val) => value = val);
    }
    else {
      // We'll assume that everything that doesn't have a 'then' method is 
      // just an immediate value
      value = futureValue; 
    }
  });
  
  return function() { 
    if (value == null) 
      throw new Error('beforeEach should have set this value.');
    return value; }; 
}
exports.define = define; 

// Forward certain things that the top level helper defines, for convenience: 
exports.settings = toplevelHelpers.settings;
