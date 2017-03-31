// @flow

const influx = require('influx');

import type {IPoint} from 'influx';
import type {Logger} from 'components/utils/src/logging';

/** Connection to the influx database. Adds error handling and logging on top
 * of our database driver. 
 */
class InfluxConnection {
  conn: influx.InfluxDB; 
  logger: Logger; 
  
  constructor(connectionSettings: ISingleHostConfig, logger: Logger) {
    this.conn = new influx.InfluxDB(connectionSettings);
    this.logger = logger; 
  }
  
  createDatabase(name: string): Promise<*> {
    this.logger.debug(`Creating database ${name}.`);
    return this.conn.createDatabase(name);
  }
  
  writeMeasurement(
    name: string, 
    points: Array<IPoint>, 
    options?: IWriteOptions
  ): Promise<void> 
  {
    this.logger.debug(`Write -> ${name}: ${points.length} points.`);
    return this.conn.writeMeasurement(name, points, options);
  }
  
  query(query: string, options?: IQueryOptions): Promise<IResults> {
    const singleLine = query.replace(/\s+/g, ' ');
    this.logger.debug(`Query: ${singleLine}`); 
    
    return this.conn.query(query, options); 
  }
}

module.exports = InfluxConnection; 
