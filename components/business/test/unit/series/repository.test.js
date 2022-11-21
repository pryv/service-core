/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
'use strict';
// Tests pertaining to storing data in a hf series.
/* global describe, it */
const influx = require('influx');
const series = require('business').series;
const userStorage = require('test-helpers').dependencies.storage.user.events;
const Repository = series.Repository;
const DataMatrix = series.DataMatrix;
describe('business.series.Repository', function () {
  describe('with stubbed out connection', function () {
    const namespace = 'pryv-userdb.USER_ID'; // influx database
    const seriesName = 'event.EVENT_ID'; // influx measurement
    const data = new DataMatrix(['deltaTime', 'a', 'b'], [[0, 1, 2]]);
    // A test double for the actual connection:
    const influxConnection = {
      createDatabase: () => Promise.resolve(true),
      writeMeasurement: () => Promise.resolve(true),
      dropMeasurement: () => Promise.resolve(true)
    };
    it('[0UEA] should produce series objects for events', function () {
      const repository = new Repository(influxConnection, userStorage);
      const series = repository.get(namespace, seriesName);
      return series.then((series) => series.append(data));
    });
  });
});
