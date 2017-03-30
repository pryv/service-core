// @flow
// 
const influx = require('influx');

const Series = require('./series');

import type {Logger} from 'components/utils/src/logging';

/** Repository of all series in this Pryv instance. 
 */
class Repository {
  influxConnection: influx.InfluxDB;
  logger: Logger; 

  /** Constructs a series repository based on a connection to InfluxDB. 
   * 
   * @param influxConnection {InfluxDB} handle to the database instance
   */
  constructor(influxConnection: influx.InfluxDB, logger: Logger) {
    this.influxConnection = influxConnection;
    this.logger = logger;
  }

  /** Return a series from a given namespace. 
   * 
   * In practice, we'll map namespaces to pryv users and series to events. 
   * 
   * @param namespace {string} - namespace to look for series
   * @param name {string} - name of the series
   * @return {Series} - series instance that can be used to manipulate the data
   */
  get(namespace: string, name: string): Promise<Series> {
    // TODO Cache all the setup checks we do here in an LRU cache. 
    
    // Make sure that the database exists:
    const databaseCheck = this.influxConnection
      .createDatabase(namespace);

    return databaseCheck.then(() => new
      Series(this.influxConnection, namespace, name, this.logger));
  }
}

module.exports = Repository;
