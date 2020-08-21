/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
'use strict';
// @flow

// Tests pertaining to managing influx data - acceptance tests that actually write. 

/* global describe, it */
const { should } = require('../../test-helpers');

const influx = require('influx');

const series = require('../../../src/index.js').series; 
const Repository = series.Repository; 
const DataMatrix = series.DataMatrix; 
const userStorage = require('components/test-helpers').dependencies.storage.user.events;

describe('Manage InfluxDB data (business.series.*)', function () {
  const connection = new influx.InfluxDB({
    host: 'localhost'});
  
  // TODO beforeEach delete the measurement
  
  it('[8GFH] should allow writing to a series', function () {
    const seriesName = 'series1';
    const repository = new Repository(connection, userStorage);
    const series = repository.get('test.manage_influx_data', seriesName);
    
    const toNano = (v) => v * 1000 * 1000 * 1000; 
    const data = new DataMatrix(
      ['deltaTime', 'value'], 
      [
        [toNano(0), 10], 
        [toNano(1), 20],
      ]
    ); 
    
    return series
      .then((series) => {
        return series.append(data) 
          .then(() => series.query({from: 0, to: 2}) )
          .then((data) => {
            should(data.length).be.eql(2);
            should(data.columns).be.eql(['deltaTime', 'value']);
            
            should(data.at(0)).be.eql([0, 10]);
            should(data.at(1)).be.eql([1, 20]);
          });
      });

  });
});
