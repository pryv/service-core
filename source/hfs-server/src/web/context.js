// @flow

import type {InfluxDB} from 'influx';

const business = require('components/business');

type Repository = business.series.Repository;

import type {Logger} from 'components/utils/src/logging';

/** Request context object which is created initially in Server and the passed
 * to every request handler as first argument. 
 * 
 * Like a singleton, but managed by the server instance. 
 */
class Context {
  seriesRepository: Repository; 
  
  constructor(influxConn: InfluxDB, logFactory: (name: string) => Logger) {
    this.seriesRepository = new business.series.Repository(
      influxConn, logFactory('influx'));
  }
}

module.exports = Context;
