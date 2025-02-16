/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

// Tests that exercise auth checks that have been disabled in other tests.

const should = require('should');
const chai = require('chai');
const assert = chai.assert;
const storage = require('storage');
const { databaseFixture } = require('test-helpers');
const { MetadataLoader, MetadataCache } = require('../../src/metadata_cache');
const { getConfig, getLogger } = require('@pryv/boiler');
const { getMall } = require('mall');

describe('Metadata Loader', function () {
  let database, pryv, mall;
  before(async function () {
    await require('business/src/system-streams/serializer').init();
    database = await storage.getDatabase();
    pryv = databaseFixture(database);
    mall = await getMall();
  });

  let loader;
  beforeEach(async () => {
    loader = new MetadataLoader();
    await loader.init(database, mall, getLogger('metadata-test'));
  });
  const USER_NAME = 'foo';
  const EVENT_ID = 'c1';
  const ACCESS_TOKEN = 'a1';
  afterEach(async function () {
    await pryv.clean();
  });
  // Build the database fixture
  beforeEach(async () => {
    const user = await pryv.user(USER_NAME, {}, function (user) {});
    const stream = await user.stream({ id: 'something' }, function (stream) {});
    await stream.event({ id: EVENT_ID });
    await user.session(ACCESS_TOKEN);
    await user.access({ token: ACCESS_TOKEN, type: 'personal' });
  });

  it('[U6F2] should allow write access to series', function () {
    const metadata = loader.forSeries(USER_NAME, EVENT_ID, ACCESS_TOKEN);
    return metadata.then((metadata) => {
      should(metadata.canWrite()).be.true();
    });
  });
});
describe('Metadata Cache', function () {
  let config;
  before(async function () {
    config = await getConfig();
    await require('business/src/system-streams/serializer').init();
  });
  it('[O8AE] returns loaded metadata for N minutes', async () => {
    let n = 0;
    const loaderStub = {
      forSeries: function () {
        n += 1;

        // Use this as a value for now, it serves verification only
        return Promise.resolve(n);
      }
    };

    // stubbing the value of loader here.
    const cache = new MetadataCache(null, loaderStub, config);
    await cache.init();

    const a = await cache.forSeries('foo', '1234', '5678');
    const b = await cache.forSeries('foo', '1234', '5678');

    assert.strictEqual(a, 1);
    assert.strictEqual(b, 1);
  });
});
