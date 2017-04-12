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

// Forward certain things that the top level helper defines, for convenience: 
exports.settings = toplevelHelpers.settings;
