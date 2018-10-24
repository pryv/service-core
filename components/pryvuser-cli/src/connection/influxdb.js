// @flow

const Influx = require('influx');
const assert = require('assert');

import type { InfluxDbSettings } from '../configuration';

class InfluxDB {
  conn: *; 

  constructor(config: InfluxDbSettings) {
    this.conn = new Influx.InfluxDB(config);
  }

  async preflight(username: string): Promise<void> {
    const influx = this.conn; 

    // InfluxDB databases are currently named after this schema: 
    //  user.cjnkfpx3a000516jn1my5wmdd
    //  ^    ^
    //  |    `- user name
    //  `- 'user' (fixed string)
    // 
    // I know this because I read hfs-server/src/metadata_cache.js. 

    const measurements = await influx.getMeasurements(username);

    // We just require 'measurements' to be an array, whatever its size. 
    assert(Array.isArray(measurements));
  }
  deleteUser(username: string): Promise<void> {
    username;
    throw new Error('Not Implemented');
  }
}

module.exports = InfluxDB;
