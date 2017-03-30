'use strict';
// @flow

// Tests pertaining to storing data in a hf series. 

/* global describe, it */
const { should } = require('../../test-helpers');
const influx = require('influx');

const series = require('../../../src/index.js').series; 
const Repository = series.Repository; 
const DataMatrix = series.DataMatrix; 

describe('business.series.Repository', function () {
  describe('with stubbed out connection', function () {
    const namespace = 'pryv-userdb.USER_ID';  // influx database
    const seriesName = 'event.EVENT_ID';      // influx measurement
    const data = new DataMatrix(
      ['timestamp', 'a', 'b'], 
      [[1490277022, 1, 2]]
    ); 

    // A test double for the actual connection:
    const influxConnection: influx.InfluxDB = {
      createDatabase: () => Promise.resolve(true),
      writeMeasurement: () => Promise.resolve(true), 
    };

    it('should produce series objects for events', function () {
      const repository = new Repository(influxConnection);
      const series = repository.get(namespace, seriesName);
      
      return series
        .then((series) => series.append(data)); 
    });
  });
});


