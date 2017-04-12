'use strict'; 
// @flow

// Test helpers for all acceptance tests. 

const NullLogger = require('components/utils/src/logging').NullLogger;
const storage = require('components/storage');

const toplevelHelpers = require('../test-helpers');

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

import type {Suite} from 'mocha';
function define<T>(suite: Suite, generator: () => Promise<T>): () => T {
  let value: ?T = null; 
  
  suite.beforeEach(() => {
    const futureValue = generator(); 

    if (futureValue.then) {
      // If generator returned a promise, return it so that mocha awaits it. 
      // Also, once the value becomes available (after this awaiting), have 
      // value contain it. 
      // 
      return futureValue.then((val) => value = val);
    }
    else {
      throw new Error('Please return a promise from your define block.');
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
