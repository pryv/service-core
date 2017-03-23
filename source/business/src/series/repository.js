
const Series = require('./series');

/** Repository of all series in this Pryv instance. 
 */
class Repository {
  
  /** Constructs a series repository based on a connection to InfluxDB. 
   */
  constructor(influxConnection) {
    this.influxConnection = influxConnection;
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
    // Make sure that the database exists:
    const databaseCheck = this.influxConnection.ensureDatabase(namespace);

    return databaseCheck
      .then(() => new Series(this.influxConnection));
  }
}

module.exports = Repository; 
