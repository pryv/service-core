/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const chai = require('chai');
const assert = chai.assert;
const cuid = require('cuid');
const rpc = require('tprpc');
const metadata = require('metadata');
const { spawnContext, produceMongoConnection, produceInfluxConnection } = require('./test-helpers');
const { databaseFixture } = require('test-helpers');

describe('Storing BATCH data in a HF series', function () {
  let database;
  before(async function () {
    database = await produceMongoConnection();
  });
  const influx = produceInfluxConnection();
  describe('Use Case: Store data in InfluxDB, Verification on either half', function () {
    let server;
    before(async () => {
      server = await spawnContext.spawn();
    });
    after(() => {
      server.stop();
    });
    let pryv;
    before(function () {
      pryv = databaseFixture(database);
    });
    after(function () {
      pryv.clean();
    });
    // Set up a basic object structure so that we can test. Ids will change with
    // every test run.
    //
    // User(userId)
    //  `- Stream(parentStreamId)
    //  |   `- event(eventId, type='series:mass/kg')
    //  |- Access(accessToken)
    //  `- Session(accessToken)
    //
    let userId, parentStreamId, eventId, accessToken;
    before(() => {
      userId = cuid();
      parentStreamId = cuid();
      eventId = cuid();
      accessToken = cuid();
      return pryv.user(userId, {}, function (user) {
        user.stream({ id: parentStreamId }, function (stream) {
          stream.event({
            id: eventId,
            type: 'series:mass/kg'
          });
        });
        user.access({ token: accessToken, type: 'personal' });
        user.session(accessToken);
      });
    });
    function storeData (data) {
      const request = server.request();
      return request
        .post(`/${userId}/series/batch`)
        .set('authorization', accessToken)
        .send(data)
        .expect(200);
    }
    it('[Q2IS] should store data correctly', async () => {
      const data = {
        format: 'seriesBatch',
        data: [
          {
            eventId,
            data: {
              format: 'flatJSON',
              fields: ['deltaTime', 'value'],
              points: [
                [0, 10.2],
                [1, 12.2],
                [2, 14.2]
              ]
            }
          }
        ]
      };
      const response = await storeData(data);
      const body = response.body;
      if (body == null || body.status == null) { throw new Error(); }
      assert.strictEqual(body.status, 'ok');
      const headers = response.headers;
      assert.match(headers['api-version'], /^\d+\.\d+\.\d+/);
      // Check if the data is really there
      const userName = userId; // identical with id here, but will be user name in general.
      const options = { database: `user.${userName}` };
      const query = `
        SELECT * FROM "event.${eventId}"
      `;
      const result = await influx.query(query, options);
      assert.strictEqual(result.length, 3);
      const expectedValues = [
        ['1970-01-01T00:00:00.000000000Z', 10.2],
        ['1970-01-01T00:00:01.000000000Z', 12.2],
        ['1970-01-01T00:00:02.000000000Z', 14.2]
      ];
      for (const row of result) {
        if (row.time == null || row.value == null) { throw new Error('Should have time and value.'); }
        const [expTime, expValue] = expectedValues.shift();
        assert.strictEqual(row.time && row.time.toNanoISOString(), expTime);
        assert.strictEqual(row.value, expValue);
      }
    });
  });
  describe('POST /:user_name/series/batch', () => {
    let server;
    before(async () => {
      server = await spawnContext.spawn();
    });
    after(() => {
      server.stop();
    });
    let pryv;
    before(function () {
      pryv = databaseFixture(database);
    });
    after(function () {
      pryv.clean();
    });
    // Set up a basic object structure so that we can test. Ids will change with
    // every test run.
    //
    // User(userId)
    //  `- Stream(parentStreamId)
    //  |   `- event(eventId, type='series:mass/kg')
    //  |- Access(accessToken)
    //  `- Session(accessToken)
    //
    let userId, parentStreamId, eventId1, eventId2, accessToken, data1, data2;
    before(() => {
      userId = cuid();
      parentStreamId = cuid();
      eventId1 = cuid();
      eventId2 = cuid();
      accessToken = cuid();
      const points = [
        [0, 10.2],
        [1, 12.2],
        [2, 14.2]
      ];
      data1 = {
        eventId: eventId1,
        data: {
          format: 'flatJSON',
          fields: ['deltaTime', 'value'],
          points
        }
      };
      data2 = {
        eventId: eventId2,
        data: {
          format: 'flatJSON',
          fields: ['deltaTime', 'value'],
          points
        }
      };
      return pryv.user(userId, {}, function (user) {
        user.stream({ id: parentStreamId }, function (stream) {
          stream.event({
            id: eventId1,
            type: 'series:mass/kg'
          });
          stream.event({
            id: eventId2,
            type: 'series:mass/kg'
          });
        });
        user.access({ token: accessToken, type: 'personal' });
        user.session(accessToken);
      });
    });
    // Fixes #212
    it('[A3BQ] should return core-metadata in every call', async () => {
      const data = {
        format: 'seriesBatch',
        data: [data1]
      };
      const res = await server
        .request()
        .post(`/${userId}/series/batch`)
        .set('authorization', accessToken)
        .send(data);
      chai.expect(res).to.have.property('status').that.eql(200);
      chai.expect(res.body).to.have.property('meta');
    });
    it("[QHM5] should fail without 'Authorization' header", async () => {
      const data = {
        format: 'seriesBatch',
        data: [data1]
      };
      const response = await server
        .request()
        .post(`/${userId}/series/batch`)
        .send(data);
      assert.strictEqual(response.statusCode, 400);
      const body = response.body;
      assert.strictEqual(body.error.id, 'missing-header');
    });
    describe('when the token has no permissions on the event', () => {
      let server;
      before(async () => {
        server = await spawnContext.spawn();
        await server.process.sendToChild('mockAuthentication', false);
      });
      after(() => {
        server.stop();
      });
      it('[R57L] fails', async () => {
        const response = await storeData(server.request(), {
          format: 'seriesBatch',
          data: [data1]
        });
        assert.strictEqual(response.statusCode, 403);
      });
    });
    describe('when the token has a "create-only" permission', () => {
      let server;
      before(async () => {
        server = await spawnContext.spawn();
      });
      after(() => {
        server.stop();
      });
      let pryv;
      before(function () {
        pryv = databaseFixture(database);
      });
      after(function () {
        pryv.clean();
      });
      let userId, streamId, createOnlyToken, event;
      before(async () => {
        userId = cuid();
        streamId = cuid();
        createOnlyToken = cuid();
        const user = await pryv.user(userId, {});
        user.access({
          token: createOnlyToken,
          type: 'app',
          permissions: [
            {
              streamId,
              level: 'create-only'
            }
          ]
        });
        const stream = await user.stream({ id: streamId }, function () { });
        event = await stream.event({
          type: 'series:mass/kg'
        });
        event = event.attrs;
      });
      it('[ATAH] should work', async () => {
        const res = await server
          .request()
          .post(`/${userId}/series/batch`)
          .set('authorization', createOnlyToken)
          .send({
            format: 'seriesBatch',
            data: [
              {
                eventId: event.id,
                data: {
                  format: 'flatJSON',
                  fields: ['deltaTime', 'value'],
                  points: [
                    [1, 1],
                    [2, 2]
                  ]
                }
              }
            ]
          });
        assert.equal(res.status, 200);
      });
    });
    describe('when using a metadata updater stub', () => {
      // A stub for the real service. Tests might replace parts of this to do
      // custom assertions.
      let stub;
      beforeEach(() => {
        stub = {
          scheduleUpdate: () => {
            return Promise.resolve({});
          },
          getPendingUpdate: () => {
            return Promise.resolve({ found: false, deadline: 0 });
          }
        };
      });
      // Loads the definition for the MetadataUpdaterService.
      let definition;
      before(async () => {
        definition = await metadata.updater.definition;
      });
      // Constructs and launches an RPC server on port 14000.
      let rpcServer;
      beforeEach(async () => {
        const endpoint = '127.0.0.1:14000';
        rpcServer = new rpc.Server();
        rpcServer.add(definition, 'MetadataUpdaterService', stub);
        await rpcServer.listen(endpoint);
        // Tell the server (already running) to use our rpc server.
        await server.process.sendToChild('useMetadataUpdater', endpoint);
      });
      afterEach(async () => {
        // Since we modified the test server, spawn a new one that is clean.
        server.stop();
        server = await spawnContext.spawn();
        rpcServer.close();
      });
      it('[OO01] should schedule a metadata update on every store', async () => {
        // Formulates an update for 2 events, to test if we get two entries in
        // the end.
        const data = {
          format: 'seriesBatch',
          data: [data1, data2]
        };

        let updaterCalled = false;
        // This is ok, we're replacing the stub with something compatible.
        stub.scheduleUpdate = (req) => {
          updaterCalled = true;
          assert.strictEqual(req.entries.length, 2);
          return Promise.resolve({});
        };
        await storeData(server.request(), data)
        // .then(res => console.log(res.body));
          .expect(200);
        assert.isTrue(updaterCalled);
      });
    });
    function storeData (request, data) {
      return request
        .post(`/${userId}/series/batch`)
        .set('authorization', accessToken)
        .send(data);
    }
  });
});

/** @typedef {string | number} DataValue */

/** @typedef {Array<DataValue>} Row */

/**
 * @typedef {{
 *   format: 'flatJSON';
 *   fields: Array<string>;
 *   points: Array<Row>;
 * }} FlatJSONData
 */

/**
 * @typedef {{
 *   eventId: string;
 *   data: FlatJSONData;
 * }} SeriesEnvelope
 */

/**
 * @typedef {{
 *   format: 'seriesBatch';
 *   data: Array<SeriesEnvelope>;
 * }} SeriesBatchEnvelope
 */
