// @flow

import type {InfluxDB, Expression} from 'influx';

const R = require('ramda');
const influx = require('influx');

const DataMatrix = require('./data_matrix');

type Timestamp = (Date | string | number); 
type Query = {
  from?: Timestamp, 
  to?: Timestamp, 
}

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
    const statement = `
      SELECT * FROM ${measurementName}
      WHERE ${condition.toString()}
      ORDER BY time ASC
      LIMIT 10
    `;
    console.log(statement);
    
    return this.connection.query(statement, queryOptions);
  }
  
  buildExpression(query: Query): Expression {
    // NOTE it looks as though exp is a value producing chain, but really, it
    // stores the whole query internally (side effect).
    let subConditions = []; 
    let exp = () => new influx.Expression(); 
    
    if (query.from) {
      subConditions.push(
        exp().field('time').gte.value(query.from));
    }
    if (query.to) {
      subConditions.push(
        exp().field('time').lt.value(query.to));
    }
    
    // If we have no conditions in the query, return an empty expression. 
    if (subConditions.length <= 0) return exp().value(1).equals.value(1); 
    
    // assert: subConditions.length > 0
    
    const or = (exp, andExp) => 
      exp.and.exp(() => andExp);
    return R.reduce(or, R.head(subConditions), R.tail(subConditions));
  }
}

module.exports = Series;