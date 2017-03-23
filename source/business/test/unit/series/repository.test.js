'use strict';
// @flow

// Tests pertaining to storing data in a hf series. 

/* global describe, it */
const { should } = require('../../test-helpers');
const testdouble = require('testdouble');

const series = require('../../../src/index.js').series; 
const Repository = series.Repository; 
const DataMatrix = series.DataMatrix; 

describe('business.series.Repository', function () {
  const namespace = 'pryv-userdb.USER_ID';  // influx database
  const seriesName = 'event.EVENT_ID';      // influx measurement
  const data = new DataMatrix(); 

  // A test double for the actual connection:
  const influxConnection = {
    ensureDatabase: () => Promise.resolve(true),
  };

  it('should produce series objects for events', function () {
    const repository = new Repository(influxConnection);
    const series = repository.get(namespace, seriesName);
    
    return series
      .then((series) => series.append(data)); 
  });
});


