/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

'use strict';

// Tests pertaining to managing influx data - acceptance tests that actually write.

const { should } = require('../../test-helpers');
const { getConfig } = require('@pryv/boiler');
const influx = require('influx');
const series = require('business').series;
const Repository = series.Repository;
const DataMatrix = series.DataMatrix;
const userStorage = require('test-helpers').dependencies.storage.user.events;
const SystemStreamsSerializer = require('business/src/system-streams/serializer');
describe('Manage InfluxDB data (business.series.*)', function () {
  const connection = new influx.InfluxDB({
    host: '127.0.0.1'
  });
  before(async () => {
    await getConfig();
    SystemStreamsSerializer.init();
  });
  // TODO beforeEach delete the measurement
  it('[8GFH] should allow writing to a series', function () {
    const seriesName = 'series1';
    const repository = new Repository(connection, userStorage);
    const series = repository.get('test.manage_influx_data', seriesName);
    const toNano = (v) => v * 1000 * 1000 * 1000;
    const data = new DataMatrix(['deltaTime', 'value'], [
      [toNano(0), 10],
      [toNano(1), 20]
    ]);
    return series.then((series) => {
      return series
        .append(data)
        .then(() => series.query({ from: 0, to: 2 }))
        .then((data) => {
          should(data.length).be.eql(2);
          should(data.columns).be.eql(['deltaTime', 'value']);
          should(data.at(0)).be.eql([0, 10]);
          should(data.at(1)).be.eql([1, 20]);
        });
    });
  });
});
