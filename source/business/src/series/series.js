// @flow

import type {InfluxDB} from 'influx';
const R = require('ramda');

const DataMatrix = require('./data_matrix');

/** Represents a single data series in influxDB. 
 * 
 * This is the high level internal interface to series. Series can be
 * manipulated through this interface. 
 */
class Series {
  namespace: string; 
  name: string; 
  connection: InfluxDB; 
  
  /** Internal constructor, creates a series with a given name in the namespace
   * given.
   */
  constructor(conn: InfluxDB, namespace: string, name: string) {
    this.connection = conn; 
    this.namespace = namespace;
    this.name = name; 
  }
  
  /** Append data to this series. 
   * 
   * This will append the data given in `data` to this series. You should 
   * make sure that the data matches the event this series is linked to before
   * calling this method. 
   * 
   * @param data {DataMatrix} - data to store to the series
   * @return {Promise<*>} - promise that resolves once the data is stored
   */
  append(data: DataMatrix): Promise<*> {
    const appendOptions = {
      database: this.namespace, 
    };
    
    // Transform all data rows into a measurement point. Transform of rows 
    // is done via toStruct in DataMatrix.Row.
    const toMeasurement = (row) => {
      return {
        tags: [], 
        fields: row.toStruct(), 
      };
    };
    const points = R.map(toMeasurement, data);
    
    return this.connection.writeMeasurement(this.name, points, appendOptions);
  }
}

module.exports = Series;