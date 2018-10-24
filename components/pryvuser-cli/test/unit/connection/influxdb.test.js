// @flow

/* global describe, it, beforeEach */

const Influx = require('influx');

import type { InfluxDbSettings } from '../../../src/configuration';
const InfluxDB = require('../../../src/connection/influxdb');

const chai = require('chai');
const assert = chai.assert; 

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

    const DATABASE_NAME = 'user.jsmith';

    // Creates a few measurements inside a database called 'user.jsmith'. 
    beforeEach(async () => {
      const conn = new Influx.InfluxDB(settings);
      const opts = { database: DATABASE_NAME };

      await conn.createDatabase(DATABASE_NAME);
      await conn.writePoints([
        {
          measurement: 'response_times',
          fields: { duration: 10 },
        }
      ], opts);
    });

    it('produces smoke', async () => {
      const opts = { database: DATABASE_NAME };
      const conn = new Influx.InfluxDB(settings);

      const measurements = await conn.getMeasurements(DATABASE_NAME);
      assert.isAbove(measurements.length, 0);

      // Make sure the database exists: If we try to write, a missing db will 
      // provoke an error. 
      await conn.writePoints([
        {
          measurement: 'response_times',
          fields: { duration: 10 },
        }
      ], opts);
    });
    describe('#preflight', () => {
      it('checks the connection and exits', async () => {
        await influxdb.preflight('jsmith');
      });
    });
    describe('#deleteUser(username)', () => {
      it("deletes the user's database", async () => {
        await influxdb.deleteUser('jsmith');

        const conn = new Influx.InfluxDB(settings);
        const measurements = await conn.getMeasurements(DATABASE_NAME);
        assert.strictEqual(measurements.length, 0);
      });
    });
  });  
});