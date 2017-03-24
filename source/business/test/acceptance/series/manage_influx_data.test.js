'use strict';
// @flow

// Tests pertaining to managing influx data - acceptance tests that actually write. 

/* global describe, it */
const { should } = require('../../test-helpers');

const influx = require('influx');

const series = require('../../../src/index.js').series; 
const Repository = series.Repository; 
const DataMatrix = series.DataMatrix; 

describe('Manage InfluxDB data (business.series.*)', function () {
  const connection = new influx.InfluxDB({
    host: 'localhost'});
  
  it('should allow writing to a series', function () {
    const seriesName = 'series1';
    const repository = new Repository(connection);
    const series = repository.get('test.manage_influx_data', seriesName);
    const data = new DataMatrix(
      ['timestamp', 'value'], 
      [
        [1490277022, 10], 
        [1490277023, 20],
      ]
    ); 
    
    return series
      .then((series) => series.append(data)); 
  });
});
