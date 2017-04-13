// @flow
// 

const Series = require('./series');
import type InfluxConnection from './influx_connection';

/** Repository of all series in this Pryv instance. 
 */
class Repository {
  connection: InfluxConnection;

  /** Constructs a series repository based on a connection to InfluxDB. 
   * 
   * @param influxConnection {InfluxDB} handle to the database instance
   */
  constructor(influxConnection: InfluxConnection) {
    this.connection = influxConnection;
  }

  /** Return a series from a given namespace. 
   * 
   * In practice, we'll map namespaces to pryv users and series to events. Please
   * see MetadataRepository and SeriesMetadata for how to get a namespace and a
   * name. 
   * 
   * Example: 
   *    
   *    seriesRepo.get(...seriesMeta.namespace())
   * 
   * @param namespace {string} - namespace to look for series
   * @param name {string} - name of the series
   * @return {Series} - series instance that can be used to manipulate the data
   */
  get(namespace: string, name: string): Promise<Series> {
    // TODO Cache all the setup checks we do here in an LRU cache. 
    
    // Make sure that the database exists:
    const databaseCheck = this.connection
      .createDatabase(namespace);

    return databaseCheck.then(() => new
      Series(this.connection, namespace, name));
  }
}

module.exports = Repository;
