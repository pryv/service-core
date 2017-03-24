// @flow

import type {InfluxDB, Expression, IResults} from 'influx';

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
    const statement = `
      SELECT * FROM ${measurementName}
      WHERE ${condition.toString()}
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

    // Replace influx 'time' with 'timestamp'
    const idx = R.findIndex(
      R.equals('time'), headers); 
    if (idx >= 0) headers[idx] = 'timestamp';
      
    const extractHeaders = (e) => R.map(R.prop(R.__, e), headers);
    const data = R.map(extractHeaders, result); 
    
    return new DataMatrix(headers, data);
  }
  
  /** Builds an expression that can be used within `WHERE` from a query. 
   */
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