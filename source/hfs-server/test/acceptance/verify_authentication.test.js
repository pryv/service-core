// @flow

// Tests that exercise auth checks that have been disabled in other tests. 

/* global describe, it */
const { should, settings } = require('./test-helpers');
const memo = require('memo-is');
const databaseFixture = require('../support/database_fixture');

const {MetadataLoader, MetadataCache} = require('../../src/metadata_cache');

import type {MetadataRepository} from '../../src/metadata_cache';
import type {Memo} from 'memo-is';

describe('Metadata Loader', function () {
  const loader: Memo<MetadataRepository> = 
    memo().is(() => new MetadataLoader());

  const EVENT_ID = 'c1';
  const ACCESS_TOKEN = 'a1';

  const pryv = databaseFixture(this);
  pryv.user('foo', function (user) {
    user.stream('something', {}, function (stream) {
      stream.event({id: EVENT_ID});
    });
    
    user.access({token: ACCESS_TOKEN});
  });
  
  it('should allow write access to series', function () {
    const metadata = loader().forSeries(EVENT_ID, ACCESS_TOKEN);
    
    should(metadata.canWrite()).be.true(); 
  });
});

describe('Metadata Cache', function () {
  
});