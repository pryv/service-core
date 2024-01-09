/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const cuid = require('cuid');
const assert = require('chai').assert;

const { produceMongoConnection, context } = require('./test-helpers');
const { databaseFixture } = require('test-helpers');

const http = require('http');
const superagent = require('superagent');
const { promisify } = require('util');

const N_ITEMS = 2000;
describe('events streaming with ' + N_ITEMS + ' entries', function () {
  this.timeout(60 * 2 * 1000);

  let mongoFixtures;
  before(async function () {
    mongoFixtures = databaseFixture(await produceMongoConnection());
  });

  let apiServer;
  before(async function () {
    apiServer = await context.spawn();
  });

  let user, username, streamId, appAccessToken;
  before(async function () {
    username = 'test-stream';
    streamId = 'test';
    appAccessToken = cuid();
    user = await mongoFixtures.user(username, {});
    await user.stream({
      id: streamId
    });
    await user.access({
      type: 'app',
      token: appAccessToken,
      permissions: [{
        streamId: '*',
        level: 'manage'
      }]
    });
    // load lots of events
    for (let i = 0; i < N_ITEMS; i++) {
      await user.event({
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
    const options = {
      host: apiServer.host,
      port: apiServer.port,
      path: '/' + username + '/events?limit=' + N_ITEMS + '&auth=' + appAccessToken,
      method: 'GET'
    };

    let lastChunkRecievedAt = Date.now();
    http.request(options, function (res) {
      assert.equal(res.headers['content-type'], 'application/json');
      assert.equal(res.headers['transfer-encoding'], 'chunked');
      res.setEncoding('utf8');
      let jsonString = '';
      let chunkCount = 0;
      res.on('data', function (chunk) {
        if (Date.now() - lastChunkRecievedAt > 500) throw new Error('It took more that 500ms between chunks');
        lastChunkRecievedAt = Date.now();
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

  it('[XZGB] Streams deleted in sent as chunked', async function () {
    const options = {
      host: apiServer.host,
      port: apiServer.port,
      path: '/' + username + '/streams/' + streamId + '?mergeEventsWithParent=false&auth=' + appAccessToken,
      method: 'DELETE'
    };

    const resultTrash = await superagent.delete(`http://${options.host}:${options.port}${options.path}`);
    assert.isTrue(resultTrash.body?.stream?.trashed);

    let lastChunkRecievedAt = Date.now();

    await promisify(function (callback) {
      http.request(options, function (res) {
        assert.equal(res.headers['content-type'], 'application/json');
        assert.equal(res.headers['transfer-encoding'], 'chunked');
        res.setEncoding('utf8');
        let jsonString = '';
        let chunkCount = 0;
        res.on('data', function (chunk) {
          if (Date.now() - lastChunkRecievedAt > 2000) throw new Error('It took more that 2000ms between chunks');
          lastChunkRecievedAt = Date.now();
          chunkCount++;
          jsonString += chunk;
        });
        res.on('end', () => {
          lastChunkRecievedAt = -1;
          assert.equal(JSON.parse(jsonString).updatedEvents.length, N_ITEMS);
          assert.isAtLeast(chunkCount, 3, 'Should receive at least 3 chunks');
          callback();
        });
        res.on('error', function (error) {
          callback(error);
        });
      }).end();
    })();
  });
});
