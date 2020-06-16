// @flow

// Tests pertaining to storing data in a hf series.

/* global describe, it */
const influx = require('influx');

const { series } = require('../../../src/index.js');

const { Repository } = series;
const { DataMatrix } = series;

describe('business.series.Repository', () => {
  describe('with stubbed out connection', () => {
    const namespace = 'pryv-userdb.USER_ID'; // influx database
    const seriesName = 'event.EVENT_ID'; // influx measurement
    const data = new DataMatrix(
      ['deltaTime', 'a', 'b'],
      [[0, 1, 2]],
    );

    // A test double for the actual connection:
    const influxConnection: influx.InfluxDB = {
      createDatabase: () => Promise.resolve(true),
      writeMeasurement: () => Promise.resolve(true),
      dropMeasurement: () => Promise.resolve(true),
    };

    it('[0UEA] should produce series objects for events', () => {
      const repository = new Repository(influxConnection);
      const series = repository.get(namespace, seriesName);

      return series
        .then((series) => series.append(data));
    });
  });
});
