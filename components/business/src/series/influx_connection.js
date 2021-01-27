/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const influx = require('influx');
const { getLogger } = require('boiler');

import type {IPoint}  from 'influx';

/** Connection to the influx database. Adds error handling and logging on top
 * of our database driver. 
 */
class InfluxConnection {
  conn: influx.InfluxDB; 
  logger; 
  
  constructor(connectionSettings: ISingleHostConfig) {
    this.conn = new influx.InfluxDB(connectionSettings);
    this.logger = getLogger('influx'); 
  }
  
  createDatabase(name: string): Promise<*> {
    this.logger.debug(`Creating database ${name}.`);
    return this.conn.createDatabase(name);
  }
  
  dropDatabase(name: string): Promise<void> {
    this.logger.debug(`Dropping database ${name}.`);
    return this.conn.dropDatabase(name);
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

  dropMeasurement(
    name: string,
    dbName: string
  ): Promise<void> {
    this.logger.debug(`Drop -> measurement: ${name} on dbName ${dbName}`, this.logger);
    return this.conn.dropMeasurement(name, dbName);
  }
  
  writePoints(points: Array<IPoint>, options?: IWriteOptions): Promise<void> {
    this.logger.debug(`Write -> (multiple): ${points.length} points.`);
    return this.conn.writePoints(points, options);
  }
  
  query(query: string, options?: IQueryOptions): Promise<IResults> {
    const singleLine = query.replace(/\s+/g, ' ');
    this.logger.debug(`Query: ${singleLine}`); 
    
    return this.conn.query(query, options); 
  }
}

module.exports = InfluxConnection; 
