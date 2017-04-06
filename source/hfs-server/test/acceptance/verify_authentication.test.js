// @flow

// Tests that exercise auth checks that have been disabled in other tests. 

/* global describe, it */
const memo = require('memo-is');

const { should, settings } = require('./test-helpers');

const NullLogger = require('components/utils/src/logging').NullLogger;
const storage = require('components/storage');
const databaseFixture = require('../support/database_fixture');

const {MetadataLoader, MetadataCache} = require('../../src/metadata_cache');

import type {MetadataRepository} from '../../src/metadata_cache';
import type {Memo} from 'memo-is';

describe('Metadata Loader', function () {
  const loggingStub = {
    getLogger: () => new NullLogger(), 
  };
  const database = new storage.Database(
    settings.get('mongodb').obj(), 
    loggingStub); 

  const loader: Memo<MetadataRepository> = 
    memo().is(() => new MetadataLoader(database));

  const USER_NAME = 'foo';
  const EVENT_ID = 'c1';
  const ACCESS_TOKEN = 'a1';

  const pryv = databaseFixture(database, this);

  pryv.user(USER_NAME, {}, function (user) {
    user.stream({id: 'something'}, function (stream) {
      stream.event({id: EVENT_ID});
    });
    
    user.access({token: ACCESS_TOKEN, type: 'personal'});
    user.session(ACCESS_TOKEN);
  });
  
  it('should allow write access to series', function () {
    const metadata = loader().forSeries(USER_NAME, EVENT_ID, ACCESS_TOKEN);
    
    return metadata
      .then((metadata) => {
        should(metadata.canWrite()).be.true();
      });
  });
});

describe('Metadata Cache', function () {
  
});