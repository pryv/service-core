'use strict';
// @flow

// Tests pertaining to storing data in a hf series. 

/* global describe, it */
const { should, request, settings } = require('./test-helpers');
const R = require('ramda');

const Server = require('../../src/Server');

describe('Storing data in a HF series', function() {
  const server = new Server(settings);
  const app = server.setupExpress();
  
  describe('POST /events/EVENT_ID/series', function() {
    const EVENT_ID = 'EVENTID';
    
    // TODO Worry about deleting data that we stored in earlier tests.
    
    function storeData(data): Promise<*> {
      const response = request(app)
        .post(`/events/${EVENT_ID}/series`)
        .send(data);
        
      return response
        .expect(200);   // Store data
    }
    function queryData(): Promise<Object> {
      let response = request(app)
        .get(`/events/${EVENT_ID}/series`)
        .query({
          fromTime: "1481677844", 
          toTime: "1481677850",
        });

      return response
        .expect(200)
        .then((res) => {
          should(res.body.elementType).be.instanceof(String);
          return res.body;
        });
    }
    
    it('stores data into InfluxDB', function() {
      const data = {
        elementType: 'mass/kg',
        format: 'flatJSON', 
        fields: ['timestamp', 'value'], 
        points: [
          [1481677845, 14.1], 
          [1481677846, 14.2], 
          [1481677847, 14.3], 
        ]
      };
      
      return storeData(data)
        .then(queryData)
        .then((response) => {
          // Verify data here
          should(response).not.be.empty(); 
          
          should(response.fields).be.eql(['timestamp', 'value']);
          
          const pairEqual = ([given, expected]) => 
            should(given).be.eql(expected);
            
          should(response.points.length).be.eql(data.points.length);
          R.all(pairEqual, R.zip(response.points, data.points));
        });
    });
    it.skip('should reject malformed requests', function () { });
    it.skip('should reject non-JSON bodies', function () { });
  }); 
});
