// @flow

import type Context from '../context';

// TODO if possible, find a more elegant way to link to error
const ServiceNotAvailableError: string =
  require('../../../../node_modules/influx/lib/src/pool')
    .ServiceNotAvailableError().constructor.name;

const R = require('ramda');

const business = require('components/business');
const errors = require('components/errors').factory;
const SeriesResponse = require('./SeriesResponse');

const AUTH_HEADER = 'authorization';
const FORMAT_FLAT_JSON = 'flatJSON';

module.exports.storeSeriesData = R.curryN(4, storeSeriesData);

/** POST /events/:event_id/series - Store data in a series. 
 */
function storeSeriesData(ctx: Context, req: express$Request, res: express$Response, next: (err: any) => void) {
  const series = ctx.series;
  const metadata = ctx.metadata;

  // Extract parameters from request: 
  const userName = req.params.user_name;
  const eventId = req.params.event_id;
  const accessToken = req.headers[AUTH_HEADER];

  // If params are not there, abort. 
  // TODO test this
  if (accessToken == null) return next(errors.missingHeader(AUTH_HEADER));
  if (eventId == null) return next(errors.invalidItemId());

  // Access check: Can user write to this series? 
  const seriesMeta = metadata.forSeries(userName, eventId, accessToken);
  return seriesMeta
    .catch(() => next(errors.forbidden()))
    .then((seriesMeta) => {
      if (!seriesMeta.canWrite()) return next(errors.forbidden());

      // Parse request
      const data = parseData(req.body);
      if (data == null) {
        return next(errors.invalidRequestStructure('Malformed request.'));
      }

      // assert: data != null

      // Store data
      // TODO derive namespace from user id
      series.get('test', 'series1')
        .then((seriesInstance) => seriesInstance.append(data))
        .then(() => {
          res
            .status(200)
            .json({status: 'ok'});
        })
        .catch((err) => {
          console.log('err caught', err)
          if (err.constructor.name === ServiceNotAvailableError) {
            return next(errors.apiUnavailable(err.message));
          }
          next(err);
        });
    })
    .catch((err) => dispatchErrors(err, next));
}

/** Handles errors that might happen during a controller execution that are 
 * translated into a client error. 
 */
function dispatchErrors(err: any, next: (err: any) => void) {
  if (err instanceof business.types.errors.InputTypeError) {
    return next(errors.invalidRequestStructure(err.message));
  }
  
  return next(err);
}

import type Type from 'business';

/** Represents the type of the timestamp column in influx input data. 
 */
class InfluxDateType implements Type {
  secondsToNanos(secs: number): number {
    return secs * 1000 * 1000 * 1000;
  }

  coerce(value: any): any {
    switch (R.type(value)) {
      case 'Number': 
        return this.secondsToNanos(value); 
      case 'String':
        return this.secondsToNanos(parseInt(value)); 
      // FALL THROUGH
    }

    throw new Error(`Cannot coerce ${value} into timestamp.`);
  }
}

const FIELD_TIMESTAMP = 'timestamp';

/** Represents the type of a row in influx input data.
 * 
 * @private
 * @memberof module:Controller
 */
class InfluxRowType {
  eventType: Type; 
  
  constructor(eventType: Type) {
    this.eventType = eventType; 
  }
  
  /** Returns true if the columns given can be reconciled with this type. 
   */
  validateColumns(columnNames: Array<string>): boolean {
    // TODO remove hard coding to simple types. 
    if (columnNames.indexOf(FIELD_TIMESTAMP) < 0) return false; 
    if (columnNames.indexOf('value') < 0) return false; 
    
    return true; 
  }
  
  /** Returns true if all the rows in the given row array are valid for this 
   * type. 
   */
  validateAllRows(rows: Array<any>, columnNames: Array<string>) {
    for (let row of rows) {
      if (! this.isRowValid(row, columnNames)) return false; 
    }
    
    return true; 
  }
  
  /** Returns true if the given row (part of the input from the client) looks 
   * right. See the code for what rules define right. 
   * 
   * Normal order of operations would be: 
   * 
   *  1) Check `columnNames` (`{@link validateColumns}`).
   *  2) For each row: 
   *    2.1) `isRowValid`?
   *    2.2) For each cell: 
   *      2.2.1) `coerce` into target type
   *      2.2.2) `isCellValid`?
   * 
   * @param row {any} Rows parsed from client input, could be any type. 
   * @param columnNames {Array<string>} A list of column names the client 
   *  provided. Check these first using `validateColumns`.
   */
  isRowValid(row: any, columnNames: Array<string>) {
    // A valid row is an array of cells. 
    const outerType = R.type(row);
    if (outerType !== 'Array') return false;
    
    // It has the correct length. (Assumes that columnNames is right)
    if (row.length !== columnNames.length) return false; 
    
    // Everything looks good. 
    return true; 
  }
  
  /** Returns the type of a single cell with column name `name`. 
   */
  forCell(name: string): Type  {
    if (name === FIELD_TIMESTAMP) {
      return new InfluxDateType();
    }
    else {
      return this.eventType.forField(name);
    }
  }
}

type DataMatrix = business.series.DataMatrix;

/** Parses request data into a data matrix that can be used as input to the
 * influx store. You should give this method the `req.body`.
 * 
 * @param createRequest {mixed} Deserialized JSON from the client
 * @return {DataMatrix} normalized data to be input to influx
 * @throw {Error} when the request is malformed
 */
function parseData(createRequest: mixed): ?DataMatrix {
  if (createRequest == null) return null; 
  if (typeof createRequest !== 'object') return null; 
  
  // assert: createRequest is a {}
  
  if (createRequest.format !== FORMAT_FLAT_JSON) return null; 
  
  const fields = checkFields(createRequest.fields);
  const points = createRequest.points; 

  if (fields == null || points == null) return null; 
  if (! (points instanceof Array)) return null; 
  
  // assert: fields, points are both arrays
  
  const type = new InfluxRowType(
    business.types.lookup('mass/kg'));
    
  if (! type.validateColumns(fields)) return null; 
  if (! type.validateAllRows(points, fields)) return null; 

  const matrix = new business.series.DataMatrix(fields, points);
  
  matrix.transform((columnName, cellValue) => {
    const cellType = type.forCell(columnName);

    const coercedValue = cellType.coerce(cellValue);
    return coercedValue; 
  });
    
  return matrix;
}

function checkFields(val: any): ?Array<string> {
  if (val == null) return null; 
  if (! (val instanceof Array)) return null; 
  
  return val;
}

module.exports.querySeriesData = R.curryN(4, querySeriesData);

/** GET /events/:event_id/series - Query a series for a data subset.
 *  
 * @param  {type} req: express$Request  description 
 * @param  {type} res: express$Response description 
 * @return {type}                       description 
 */ 
function querySeriesData(ctx: Context, req: express$Request, res: express$Response, next: () => void) {
  // if (! business.access.canReadFromSeries(eventId, authToken)) {
  //   throw errors.forbidden(); 
  // }
  // 
  
  const series = ctx.series;
  const query = parseQueryFromGET(req.query);
  
  // Store data
  // TODO derieve namespace from user id
  series.get('test', 'series1')
    .then((series) => series.query(query))
    .then((data) => {
      const responseObj = new SeriesResponse(data); 
      
      responseObj.answer(res);
    })
    .catch((err) => next(err));
}

import type Query from 'business';
function parseQueryFromGET(params: {[key: string]: string}): Query {
  type ConversionTable = Array<{
    test: RegExp, 
    convert: (v: string) => *, 
  }>;
  function interpret(obj: any, table: ConversionTable) {
    for (let {test, convert} of table) {
      if (test.test(obj)) return convert(obj);
    }
    
    return null; 
  }
  
  const query = {}; 
  const table = [ // Target format is a number of seconds since Epoch
    // TODO add conversion from date formats.
    {test: /^\d+$/, convert: parseInt},
  ];

  if (params.fromTime != null) query.from = interpret(params.fromTime, table);
  if (params.toTime != null) query.to = interpret(params.toTime, table);

  // TODO Query validity check...
  
  return query; 
}
