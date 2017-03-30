'use strict';
// @flow

// Tests pertaining to managing influx data - acceptance tests that actually write. 

/* global describe, it */
const { should } = require('../../test-helpers');

const influx = require('influx');

const NullLogger = require('components/utils/src/logging').NullLogger;

const series = require('../../../src/index.js').series; 
const Repository = series.Repository; 
const DataMatrix = series.DataMatrix; 

describe('Manage InfluxDB data (business.series.*)', function () {
  const connection = new influx.InfluxDB({
    host: 'localhost'});
  const logger = new NullLogger(); 
  
  // TODO beforeEach delete the measurement
  
  it('should allow writing to a series', function () {
    const seriesName = 'series1';
    const repository = new Repository(connection, logger);
    const series = repository.get('test.manage_influx_data', seriesName);
    
    const toNano = (v) => v * 1000 * 1000 * 1000; 
    const data = new DataMatrix(
      ['timestamp', 'value'], 
      [
        [toNano(1490277022), 10], 
        [toNano(1490277023), 20],
      ]
    ); 
    
    return series
      .then((series) => {
        return series.append(data) 
          .then(() => series.query({from: 1490277021, to: 1490277024}) )
          .then((data) => {
            should(data.length).be.eql(2);
            should(data.columns).be.eql(['timestamp', 'value']);
            
            should(data.at(0)).be.eql([1490277022, 10]);
            should(data.at(1)).be.eql([1490277023, 20]);
          });
      });

  });
});
