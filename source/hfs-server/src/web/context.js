// @flow

const business = require('components/business');

type Repository = business.series.Repository;
type InfluxConnection = business.series.InfluxConnection; 

/** Application context object, holding references to all major subsystems. 
 * Once the system is initialized, these instance references will not change 
 * any more and together make up the configuration of the system. 
 */
class Context {
  seriesRepository: Repository; 
  
  constructor(influxConn: InfluxConnection) {
    this.seriesRepository = new business.series.Repository(influxConn);
  }
}

module.exports = Context;
