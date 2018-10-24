// @flow

/* global describe, it, beforeEach */

import type { InfluxDbSettings } from '../../../src/configuration';
const InfluxDB = require('../../../src/connection/influxdb');

describe('Connection/InfluxDB', () => {
  describe('when given a username that has a few high frequency series', () => {
    const settings: InfluxDbSettings = {
      host: 'localhost', 
      port: 8086,
    };

    let influxdb; 
    beforeEach(() => {
      influxdb = new InfluxDB(settings);
    });

    describe('#preflight', () => {
      it('checks the connection and exits', async () => {
        await influxdb.preflight('jsmith');
      });
    });
    describe('#deleteUser(username)', () => {
      it.skip("deletes the user's database", () => {
      });
    });
  });  
});