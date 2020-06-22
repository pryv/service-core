/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

// Tests that exercise auth checks that have been disabled in other tests. 

/* global describe, it, before, afterEach, beforeEach */
const should = require('should');
const chai = require('chai');
const assert = chai.assert;

const { loadSettings } = require('./test-helpers');

const NullLogger = require('components/utils/src/logging').NullLogger;
const storage = require('components/storage');
const { databaseFixture } = require('components/test-helpers');

const { MetadataLoader, MetadataCache } = require('../../src/metadata_cache');

describe('Metadata Loader', function () {

  let database, settings, pryv;
  before(async function () {
    settings = await loadSettings();
    database = new storage.Database(
      settings.get('mongodb').obj(), 
      new NullLogger()); 
    pryv = databaseFixture(database);
  });
  

  let loader; 
  beforeEach(() => {
    loader = new MetadataLoader(
      database, new NullLogger()
    );
  });

  const USER_NAME = 'foo';
  const EVENT_ID = 'c1';
  const ACCESS_TOKEN = 'a1';

  afterEach(function () { pryv.clean(); });

  // Build the database fixture
  beforeEach(() => {
    return pryv.user(USER_NAME, {}, function (user) {
      user.stream({id: 'something'}, function (stream) {
        stream.event({id: EVENT_ID});
      });
      
      user.session(ACCESS_TOKEN);
      user.access({token: ACCESS_TOKEN, type: 'personal'});
    });
  });
  
  
  it('[U6F2] should allow write access to series', function () {
    const metadata = loader.forSeries(USER_NAME, EVENT_ID, ACCESS_TOKEN);
    
    return metadata
      .then((metadata) => {
        should(metadata.canWrite()).be.true();
      });
  });
});

describe('Metadata Cache', function () {

  let settings;
  before(async function () {
    settings = await loadSettings();
  });
  it('[O8AE] returns loaded metadata for N minutes', async () => {
    let n = 0; 
    const loaderStub = {
      forSeries: function() {
        n += 1;
        
        // FLOW Use this as a value for now, it serves verification only
        return Promise.resolve(n);
      }
    };
    
    // FLOW stubbing the value of loader here.
    const cache = new MetadataCache(null, loaderStub, settings);
    
    const a = await cache.forSeries('foo', '1234', '5678');
    const b = await cache.forSeries('foo', '1234', '5678');
    
    assert.strictEqual(a, 1);
    assert.strictEqual(b, 1);
  });
});