'use strict';
// @flow

// Tests pertaining to storing data in a hf series. 

/* global describe, it */
const { should } = require('../../test-helpers');
const sinon = require('sinon');

const series = require('../../../src/index.js').series; 
const Repository = series.Repository; 
const DataMatrix = series.DataMatrix; 

describe('business.series.Repository', function () {
  it('should produce series objects for events', function () {
    const influxConnection = sinon.stub(); 
    const repository = new Repository(influxConnection);
    
    const namespace = 'pryv-userdb.USER_ID';  // influx database
    const seriesName = 'event.EVENT_ID';      // influx measurement
    const series = repository.get(namespace, seriesName);
    
    const data = new DataMatrix(); 
    
    return series.append(data);
  });
});


