/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
import type { IResults } from 'influx';
import type InfluxConnection from './influx_connection';

const _ = require('lodash');
const { isoOrTimeToDate, formatDate } = require('influx/lib/src/grammar/times');

const DataMatrix = require('./data_matrix');

export type Timestamp = number;
export type Query = {
  from?: Timestamp;
  to?: Timestamp;
};

/** Represents a single data series in influxDB.
 *
 * This is the high level internal interface to series. Series can be
 * manipulated through this interface.
 */
class Series {
  namespace: string;
  name: string;
  connection: InfluxConnection;

  /** Internal constructor, creates a series with a given name in the namespace
   * given.
   */
  constructor(conn: InfluxConnection, namespace: string, name: string) {
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
  append(data: DataMatrix): Promise<any> {
    const appendOptions = {
      database: this.namespace,
    };
    const points = [];

    // Transform all data rows into a measurement point. Transform of rows
    // is done via toStruct in DataMatrix.Row.
    const toMeasurement = (row) => {
      const struct = row.toStruct();

      // FLOW This cannot fail, but somehow flow thinks we access the deltaTime.
      delete struct.deltaTime;

      const deltaTime = row.get('deltaTime');

      return {
        tags: [],
        fields: struct,
        timestamp: deltaTime,
      };
    };

    data.eachRow((row) => {
      points.push(toMeasurement(row));
    });

    return this.connection.writeMeasurement(this.name, points, appendOptions);
  }

  /** Queries the given series, returning a data matrix.
   */
  query(query: Query): Promise<DataMatrix> {
    const queryOptions = { database: this.namespace };

    // TODO worry about limit, offset
    const measurementName = this.name;
    const condition = this.buildExpression(query);
    const wherePart =
      condition.length > 0 ? 'WHERE ' + condition.join(' AND ') : '';
    const statement = `
      SELECT * FROM "${measurementName}"
      ${wherePart}
      ORDER BY time ASC
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
    const headers = Object.keys(result[0]);
    const data = result.map((e) => headers.map((h) => e[h]));

    // Replace influx 'time' with 'deltaTime'

    const idx = headers.indexOf('time');
    if (idx >= 0) headers[idx] = 'deltaTime';

    for (let row of data) {
      row[idx] = +row[idx] / 1000; // TODO replace
    }

    return new DataMatrix(headers, data);
  }

  /** Builds an expression that can be used within `WHERE` from a query.
   */
  buildExpression(query: Query): Array<string> {
    let subConditions = [];

    // Replace double quotes with single quotes, since the influx library gets
    // the date format for influx wrong...
    const correct = (v) => `'${v.slice(1, v.length - 2)}'`;
    const dateToString = (v) => correct(formatDate(isoOrTimeToDate(v, 's')));

    if (query.from) {
      subConditions.push(`time >= ${dateToString(query.from)}`);
    }
    if (query.to) {
      subConditions.push(`time < ${dateToString(query.to)}`);
    }

    return subConditions;
  }
}

module.exports = Series;
