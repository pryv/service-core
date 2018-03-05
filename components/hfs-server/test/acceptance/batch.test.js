// @flow

/* global describe, it, after, before */
const chai = require('chai');
const assert = chai.assert; 
const cuid = require('cuid');

const { 
  spawnContext, produceMongoConnection, 
  produceInfluxConnection } = require('./test-helpers');
const { databaseFixture } = require('components/test-helpers');

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
    
    it('should store data correctly', async () => {
      const data = {
        'format': 'seriesBatch',
        'data': [
          {
            'eventId': eventId,
            'data': {
              'format': 'flatJSON', 
              'fields': ['timestamp', 'latitude', 'longitude', 'altitude'], 
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
      assert.strictEqual(headers['api-version'], '1.0.0');
      
      // Check if the data is really there
      const userName = userId; // identical with id here, but will be user name in general. 
      const options = { database: `user.${userName}` };
      const query = `
        SELECT * FROM "event.${eventId}"
      `;
        
      const result = await influx.query(query, options);
      
      const expectedValues = [
        ['2016-12-14T01:10:45.000000000Z', 10.2],
        ['2016-12-14T01:10:45.000000000Z', 12.2],
        ['2016-12-14T01:10:45.000000000Z', 14.2],
      ];
      
      for (const row of result) {
        if (row.time == null || row.value == null) 
          throw new Error('Should have time and value.');
        
        const [ expTime, expValue ] = expectedValues;
        assert.strictEqual(row.time.toNanoISOString(), expTime); 
        assert.strictEqual(row.value, expValue);
      }
    });
    it.skip('should return data once stored', async () => {
      // identical with id here, but will be user name in general. 
      const userName = userId; 
      const dbName = `user.${userName}`; 
      const measurementName = `event.${eventId}`;

      await cycleDatabase(dbName);
      await storeSampleMeasurement(dbName, measurementName);
      await queryData();

      function cycleDatabase(dbName: string) {
        return influx.dropDatabase(dbName).
          then(() => influx.createDatabase(dbName));
      }
      function storeSampleMeasurement(dbName: string, measurementName: string) {
        const options = { database: dbName };

        const points = [
          {
            fields: { value: 1234 }, 
            timestamp: 1493647899000000000, 
          }
        ];
        
        return influx.writeMeasurement(measurementName, points, options);
      }
      function queryData() {
        const request = server.request();
        return request
          .get(`/${userId}/events/${eventId}/series`)
          .set('authorization', accessToken)
          .query({
            fromTime: '1493647898', toTime: '1493647900' })
          // .then((res) => console.log(require('util').inspect(res.body, { depth: null })))
          .expect(200)
          .then((res) => {
            const points = res.body.points || [];
            
            assert.isNotEmpty(points);
            assert.deepEqual(
              points[0], 
              [1493647899, 1234]); 
          });
      }
    });
  });
});