// @flow

import type {InfluxDB, IResults} from 'influx';

const R = require('ramda');
const formatDate = require('influx/lib/src/grammar/times').formatDate;

const DataMatrix = require('./data_matrix');

export type Timestamp = (Date | string | number); 
export type Query = {
  from?: Timestamp, 
  to?: Timestamp, 
}

/** Represents a single data series in influxDB. 
 * 
 * This is the high level internal interface to series. Series can be
 * manipulated through this interface. 
 * 
 * NOTE Currently, the code that accesses influx is spread out between this class
 *   and the Repository class. The easy way to centralize this is to create a 
 *   connection object and have the code be in there. I am delaying this for now, 
 *   since I don't want to create infrastructure, I want to create functionality. 
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
      const struct = row.toStruct(); 
      delete struct.timestamp; 
      
      const timestamp = row.get('timestamp');
      
      return {
        tags: [], 
        fields: struct, 
        timestamp: timestamp, 
      };
    };
    const points = R.map(toMeasurement, data);
    
    return this.connection.writeMeasurement(this.name, points, appendOptions);
  }

  /** Queries the given series, returning a data matrix. 
   */
  query(query: Query): Promise<DataMatrix> {
    const queryOptions = { database: this.namespace };
      
    // NOTE You MUST use escaping functions provided by influx here, otherwise
    // tainted input will reach the backend. 
    // TODO worry about limit, offset
    const measurementName = this.name;
    const condition = this.buildExpression(query);
    const wherePart = condition.length > 0 ? 
      'WHERE ' + condition.join(' AND ') : 
      ''; 
    const statement = `
      SELECT * FROM ${measurementName}
      ${wherePart}
      ORDER BY time ASC
      LIMIT 10
    `;

    return this.connection
      .query(statement, queryOptions)
      .then(this.transformResult.bind(this));
  }

  /** Transforms an IResult object into a data matrix. 
   */
  transformResult(result: IResults): DataMatrix {
    if (result.length <= 0) return DataMatrix.empty(); 
    
    // assert: result.length > 0
    const head = R.head(result);
    const headers = R.keys(head);

    const extractHeaders = (e) => R.map(R.prop(R.__, e), headers);
    const data = R.map(extractHeaders, result); 
    
    // Replace influx 'time' with 'timestamp'
    const idx = R.findIndex(
      R.equals('time'), headers); 
    if (idx >= 0) headers[idx] = 'timestamp';
    
    for (let row of data) {
      row[idx] = +row[idx] / 1000; // TODO replace
    }
      
    return new DataMatrix(headers, data);
  }
  
  /** Builds an expression that can be used within `WHERE` from a query. 
   */
  buildExpression(query: Query): Array<string> {
    // NOTE it looks as though exp is a value producing chain, but really, it
    // stores the whole query internally (side effect).
    let subConditions = []; 
    
    // Replace double quotes with single quotes, since the influx library gets
    // the date format for influx wrong...
    const correct = (v) => `'${v.slice(1, v.length-2)}'`;
    
    if (query.from) {
      subConditions.push(
        `time >= ${correct(formatDate(query.from))}`);
    }
    if (query.to) {
      subConditions.push(
        `time < ${correct(formatDate(query.to))}`);
    }
    
    return subConditions;
  }
}

module.exports = Series;