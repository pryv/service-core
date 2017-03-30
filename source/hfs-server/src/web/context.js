// @flow

import type {InfluxDB} from 'influx';

const business = require('components/business');

type Repository = business.series.Repository;

/** Request context object which is created initially in Server and the passed
 * to every request handler as first argument. 
 * 
 * Like a singleton, but managed by the server instance. 
 */
class Context {
  seriesRepository: Repository; 
  
  constructor(influxConn: InfluxDB) {
    this.seriesRepository = new business.series.Repository(influxConn);
  }
}

module.exports = Context;
