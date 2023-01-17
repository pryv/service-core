/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const influx = require('influx');
const { getLogger } = require('@pryv/boiler');
/** Connection to the influx database. Adds error handling and logging on top
 * of our database driver.
 */
class InfluxConnection {
  conn;

  logger;
  constructor (connectionSettings) {
    this.conn = new influx.InfluxDB(connectionSettings);
    this.logger = getLogger('influx');
  }

  /**
   * @param {string} name
   * @returns {Promise<any>}
   */
  createDatabase (name) {
    this.logger.debug(`Creating database ${name}.`);
    return this.conn.createDatabase(name);
  }

  /**
   * @param {string} name
   * @returns {Promise<void>}
   */
  dropDatabase (name) {
    this.logger.debug(`Dropping database ${name}.`);
    return this.conn.dropDatabase(name);
  }

  /**
   * @param {string} name
   * @param {Array<IPoint>} points
   * @param {IWriteOptions} options
   * @returns {Promise<void>}
   */
  writeMeasurement (name, points, options) {
    this.logger.debug(`Write -> ${name}: ${points.length} points.`);
    return this.conn.writeMeasurement(name, points, options);
  }

  /**
   * @param {string} name
   * @param {string} dbName
   * @returns {Promise<void>}
   */
  dropMeasurement (name, dbName) {
    this.logger.debug(`Drop -> measurement: ${name} on dbName ${dbName}`, this.logger);
    return this.conn.dropMeasurement(name, dbName);
  }

  /**
   * @param {Array<IPoint>} points
   * @param {IWriteOptions} options
   * @returns {Promise<void>}
   */
  writePoints (points, options) {
    this.logger.debug(`Write -> (multiple): ${points.length} points.`);
    return this.conn.writePoints(points, options);
  }

  /**
   * @param {string} query
   * @param {IQueryOptions} options
   * @returns {Promise<any>}
   */
  query (query, options) {
    const singleLine = query.replace(/\s+/g, ' ');
    this.logger.debug(`Query: ${singleLine}`);
    return this.conn.query(query, options);
  }

  /**
   * used for tests, Returns an array of database names
   * @returns {Promise<string[]>}
   */
  getDatabases () {
    return this.conn.getDatabaseNames();
  }
}
module.exports = InfluxConnection;
