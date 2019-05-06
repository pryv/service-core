// @flow

/* global describe, it, after, before, beforeEach, afterEach*/
const chai = require('chai');
const assert = chai.assert; 
const cuid = require('cuid');

const rpc = require('components/tprpc');
const metadata = require('components/metadata');

const { 
  spawnContext, produceMongoConnection, 
  produceInfluxConnection } = require('./test-helpers');
const { databaseFixture } = require('components/test-helpers');

import type { IMetadataUpdaterService } from 'components/metadata';

type DataValue = string | number;
type Row = Array<DataValue>;
type FlatJSONData = {
  format: 'flatJSON', 
  fields: Array<string>, 
  points: Array<Row>, 
};
type SeriesEnvelope = {
  eventId: string, 
  data: FlatJSONData, 
};
type SeriesBatchEnvelope = {
  format: 'seriesBatch', 
  data: Array<SeriesEnvelope>; 
};

describe('Storing BATCH data in a HF series', function() {
  const database = produceMongoConnection(); 
  const influx = produceInfluxConnection(); 

  describe('Use Case: Store data in InfluxDB, Verification on either half', function () {
    let server; 
    before(async () => {
      server = await spawnContext.spawn(); 
    });
    after(() => {
      server.stop(); 
    });
    
    const pryv = databaseFixture(database);
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
        user.stream({id: parentStreamId}, function (stream) {
          stream.event({
            id: eventId, 
            type: 'series:mass/kg'});
        });

        user.access({token: accessToken, type: 'personal'});
        user.session(accessToken);
      });
    });
    
    function storeData(data: SeriesBatchEnvelope): any {      
      const request = server.request(); 
      return request
        .post(`/${userId}/series/batch`)
        .set('authorization', accessToken)
        .send(data)
        .expect(200);
    }
    
    it('6A9P-should store data correctly', async () => {
      const data = {
        'format': 'seriesBatch',
        'data': [
          {
            'eventId': eventId,
            'data': {
              'format': 'flatJSON', 
              'fields': ['timestamp', 'value'], 
              'points': [
                [1519314345, 10.2], 
                [1519314346, 12.2],
                [1519314347, 14.2],
              ]
            }   
          }
        ]
      };
      const response = await storeData(data);

      const body = response.body; 
      if (body == null || body.status == null) throw new Error(); 
      assert.strictEqual(body.status, 'ok'); 

      const headers: {[string]: string} = response.headers; 
      assert.match(headers['api-version'], /^\d+\.\d+\.\d+/);
      
      // Check if the data is really there
      const userName = userId; // identical with id here, but will be user name in general. 
      const options = { database: `user.${userName}` };
      const query = `
        SELECT * FROM "event.${eventId}"
      `;
        
      const result: IResults = await influx.query(query, options);
      assert.strictEqual(result.length, 3);
      
      const expectedValues = [
        ['2018-02-22T15:45:45.000000000Z', 10.2],
        ['2018-02-22T15:45:46.000000000Z', 12.2],
        ['2018-02-22T15:45:47.000000000Z', 14.2],
      ];
      
      for (const row of result) {
        if (row.time == null || row.value == null) 
          throw new Error('Should have time and value.');
        
        const [ expTime, expValue ] = expectedValues.shift();
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
    
    const pryv = databaseFixture(database);
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
    let userId, parentStreamId, eventId1, eventId2, accessToken; 
    before(() => {
      userId = cuid(); 
      parentStreamId = cuid(); 
      eventId1 = cuid(); 
      eventId2 = cuid(); 
      accessToken = cuid(); 
      
      return pryv.user(userId, {}, function (user) {
        user.stream({id: parentStreamId}, function (stream) {
          stream.event({
            id: eventId1, 
            type: 'series:mass/kg'});
          stream.event({
            id: eventId2, 
            type: 'series:mass/kg'});
        });

        user.access({token: accessToken, type: 'personal'});
        user.session(accessToken);
      });
    });
    
    it("should fail without 'Authorization' header", async () => {
      const data = {
        'format': 'seriesBatch',
        'data': [
          {
            'eventId': eventId1,
            'data': {
              'format': 'flatJSON', 
              'fields': ['timestamp', 'value'], 
              'points': [
                [1519314345, 10.2], 
                [1519314346, 12.2],
                [1519314347, 14.2],
              ]
            }   
          }
        ]
      };

      const response = await server.request()
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
        await server.process.
          sendToChild('mockAuthentication', false);
      });
      after(() => {
        server.stop(); 
      });

      it('74OF-fails', async () => {
        const response = await storeData(server.request(), {
          'format': 'seriesBatch',
          'data': [
            {
              'eventId': eventId1,
              'data': {
                'format': 'flatJSON', 
                'fields': ['timestamp', 'value'], 
                'points': [
                  [1519314345, 10.2], 
                  [1519314346, 12.2],
                  [1519314347, 14.2],
                ]
              }   
            }
          ]
        });
        
        assert.strictEqual(response.statusCode, 403);
      });
    });
    describe('when using a metadata updater stub', () => {
      // A stub for the real service. Tests might replace parts of this to do 
      // custom assertions.
      let stub: IMetadataUpdaterService;
      beforeEach(() => {
        stub = {
          scheduleUpdate: () => { return Promise.resolve({ }); },
          getPendingUpdate: () => { return Promise.resolve({ found: false, deadline: 0 }); },
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
        rpcServer.add(definition, 'MetadataUpdaterService', (stub: IMetadataUpdaterService));
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
            
      it('J2B4-should schedule a metadata update on every store', async () => {
        // Formulates an update for 2 events, to test if we get two entries in
        // the end.
        const data = {
          'format': 'seriesBatch',
          'data': [
            {
              'eventId': eventId1,
              'data': {
                'format': 'flatJSON', 
                'fields': ['timestamp', 'value'], 
                'points': [
                  [1519314345, 10.2], 
                  [1519314346, 12.2],
                  [1519314347, 14.2],
                ]
              }   
            },
            {
              'eventId': eventId2,
              'data': {
                'format': 'flatJSON', 
                'fields': ['timestamp', 'value'], 
                'points': [
                  [1519314345, 10.2], 
                  [1519314346, 12.2],
                  [1519314347, 14.2],
                ]
              }   
            }
          ]
        };
        
        let updaterCalled = false; 
        // FLOW This is ok, we're replacing the stub with something compatible.
        stub.scheduleUpdate = (req) => {
          updaterCalled = true;
          
          assert.strictEqual(req.entries.length, 2);
          
          return Promise.resolve({ });
        };
        
        await storeData(server.request(), data)
          // .then(res => console.log(res.body));
          .expect(200);
        
        assert.isTrue(updaterCalled);
      });
    });

    function storeData(request, data: SeriesBatchEnvelope): any {      
      return request
        .post(`/${userId}/series/batch`)
        .set('authorization', accessToken)
        .send(data);
    }

  });
});