// @flow

// Tests pertaining to managing influx data - acceptance tests that actually write.

/* global describe, it */
const influx = require('influx');
const { should } = require('../../test-helpers');

const { series } = require('../../../src/index.js');

const { Repository } = series;
const { DataMatrix } = series;

describe('Manage InfluxDB data (business.series.*)', () => {
  const connection = new influx.InfluxDB({ host: 'localhost' });

  // TODO beforeEach delete the measurement

  it('[8GFH] should allow writing to a series', () => {
    const seriesName = 'series1';
    const repository = new Repository(connection);
    const series = repository.get('test.manage_influx_data', seriesName);

    const toNano = (v) => v * 1000 * 1000 * 1000;
    const data = new DataMatrix(
      ['deltaTime', 'value'],
      [
        [toNano(0), 10],
        [toNano(1), 20],
      ],
    );

    return series
      .then((series) => series.append(data)
        .then(() => series.query({ from: 0, to: 2 }))
        .then((data) => {
          should(data.length).be.eql(2);
          should(data.columns).be.eql(['deltaTime', 'value']);

          should(data.at(0)).be.eql([0, 10]);
          should(data.at(1)).be.eql([1, 20]);
        }));
  });
});
