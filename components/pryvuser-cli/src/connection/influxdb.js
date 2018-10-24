// @flow

const Influx = require('influx');
const assert = require('assert');

import type { InfluxDbSettings } from '../configuration';

class InfluxDB {
  conn: *; 

  constructor(config: InfluxDbSettings) {
    this.conn = new Influx.InfluxDB(config);
  }

  dbFromUsername(username: string): string {
    // InfluxDB databases are currently named after this schema: 
    // 
    //  user.cjnkfpx3a000516jn1my5wmdd
    //  ^    ^
    //  |    `- user name
    //  `- 'user' (fixed string)
    // 
    // I know this because I read hfs-server/src/metadata_cache.js. 

    return `user.${username}`;
  }

  async preflight(username: string): Promise<void> {
    const influx = this.conn; 

    const measurements = await influx.getMeasurements(
      this.dbFromUsername(username));

    // We just require 'measurements' to be an array, whatever its size. 
    assert(Array.isArray(measurements));
  }
  async deleteUser(username: string): Promise<void> {
    const influx = this.conn; 

    await influx.dropDatabase(
      this.dbFromUsername(username));
  }
}

module.exports = InfluxDB;
