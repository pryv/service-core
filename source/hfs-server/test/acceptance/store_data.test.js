'use strict';
// @flow

// Tests pertaining to storing data in a hf series. 

/* global describe, it */
const { should, request, settings } = require('./test-helpers');

const Server = require('../../src/Server');

describe('Storing data in a HF series', function() {
  const server = new Server(settings);
  const app = server.setupExpress();
  
  describe('POST /events/EVENT_ID/series', function() {
    const EVENT_ID = 'EVENTID';
    
    it('stores data into InfluxDB', function() {
      const data = {
        elementType: 'mass/kg',
        format: 'flatJSON', 
        fields: ['timestamp', 'value'], 
        data: [
          [1481677845, 14.1], 
          [1481677846, 14.2], 
          [1481677847, 14.3], 
        ]
      };
      
      const response = request(app)
        .post(`/events/${EVENT_ID}/series`)
        .send(data);
        
      response
        .then((res) => {
          should(res.status).be.eql(200);
        })
        .then(() => {
          
        });
    });
  }); 
});
