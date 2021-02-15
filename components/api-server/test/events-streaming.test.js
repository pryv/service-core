/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/*global describe, before, beforeEach, it */


const cuid = require('cuid');
const assert = require('chai').assert;

const { produceMongoConnection, context } = require('./test-helpers');
const { databaseFixture } = require('test-helpers');
const itemDeletion = require('../src/schema/itemDeletion');

const http = require('http');

const N_ITEMS = 1000;
describe('events streaming with ' + N_ITEMS + ' entries', function () {
  this.timeout(60 * 2 * 1000);
  

  let mongoFixtures;
  before(async function () {
    mongoFixtures = databaseFixture(await produceMongoConnection());
  });

  let apiServer, webhooksApp, webhooksService;
  before(async function () {
    apiServer = await context.spawn();
  });

  

  let user, username,
    streamId, appAccessToken;
  before(async function () {
    username = 'test-stream';
    streamId = 'test';
    appAccessToken = cuid();
    user = await mongoFixtures.user(username, {});
    await user.stream({
      id: streamId,
    });
    await user.access({
      type: 'app', token: appAccessToken,
      permissions: [{
        streamId: '*',
        level: 'manage',
      }]
    });
    // load 10'000 events
    for (let i = 0; i < 1000; i++) {
      let res = await user.event({
        streamIds: [streamId],
        type: 'count/step',
        content: 1
      });
    }
  });

  after(async function () {
    await apiServer.stop();
  });

  it('[SE1K] Streams events', function (done) { 
    var options = {
      host: apiServer.host,
      port: apiServer.port,
      path: '/' + username + '/events?limit=10000&auth=' + appAccessToken,
      method: 'GET'
    };

    const req = http.request(options, function (res) {
      assert.equal(res.headers['content-type', 'application/json']);
      assert.equal(res.headers['transfer-encoding', 'chunked']);
      res.setEncoding('utf8');
      let jsonString = "";
      let chunkCount = 0;
      res.on('data', function (chunk) {
        chunkCount++;
        jsonString += chunk;
      });
      res.on('end', () => {
        assert.equal(JSON.parse(jsonString).events.length, N_ITEMS);
        assert.isAtLeast(chunkCount, 3, 'Should receive at least 3 chunks');
        done();
      });
      res.on('error', function (error) { 
        done(error);
      });
    }).end();

  });

});