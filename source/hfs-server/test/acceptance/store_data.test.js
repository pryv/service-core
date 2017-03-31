'use strict';
// @flow

// Tests pertaining to storing data in a hf series. 

/* global describe, it */
const { should, request, settings } = require('./test-helpers');
const R = require('ramda');

const Application = require('../../src/Application');
const Server = require('../../src/Server');

import type {Response} from 'supertest';

describe('Storing data in a HF series', function() {
  const application = new Application().init(settings); 
  const server = application.server; 
  const app = server.setupExpress();
  
  describe('POST /events/EVENT_ID/series', function() {
    const EVENT_ID = 'EVENTID';
    
    // TODO Worry about deleting data that we stored in earlier tests.
    
    function storeData(data, authorization='valid'): Response {
      const response = request(app)
        .post(`/events/${EVENT_ID}/series`)
        .set('Authorization', authorization)
        .send(data);
        
      return response;
    }
    function queryData(): Promise<Object> {
      let response = request(app)
        .get(`/events/${EVENT_ID}/series`)
        .query({
          fromTime: '1481677844', 
          toTime: '1481677850',
        });

      return response
        .expect(200)
        .then((res) => {
          should(res.body.elementType).be.instanceof(String);
          return res.body;
        });
    }
    
    function produceData() {
      return {
        elementType: 'mass/kg',
        format: 'flatJSON', 
        fields: ['timestamp', 'value'], 
        points: [
          [1481677845, 14.1], 
          [1481677846, 14.2], 
          [1481677847, 14.3], 
        ]
      };
    }
    
    it('stores data into InfluxDB', function() {
      const data = produceData(); 
      
      return storeData(data)
        .expect(200)
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
    it('refuses invalid/unauthorized accesses', function () {
      const data = produceData(); 
      
      return storeData(data, 'invalid')
        .expect(403)
        .then((res) => {
          const error = res.body.error; 
          should(error.id).be.eql('forbidden');
          should(error.message).be.instanceof(String);
        });
    });
    it.skip('should reject malformed requests', function () { });
    it.skip('should reject non-JSON bodies', function () { });
  }); 
  describe('GET /events/EVENT_ID/series', function () {
    it.skip('should query data from the influx store', function () { });
    it.skip('should return correctly for empty sets', function () { });
  });
});
