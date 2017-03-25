// @flow

import type {InfluxDB} from 'influx';
import type {Repository as SeriesRepository} from 'components/business';

const business = require('components/business');

/** Request context object which is created initially in Server and the passed
 * to every request handler as first argument. 
 * 
 * Like a singleton, but managed by the server instance. 
 */
class Context {
  seriesRepository: SeriesRepository; 
  
  constructor(influxConn: InfluxDB) {
    this.seriesRepository = new business.series.Repository(influxConn);
  }
}

module.exports = Context;
