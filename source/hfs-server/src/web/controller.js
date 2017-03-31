// @flow

import type Context from '../context';

const R = require('ramda');

const business = require('components/business');
const errors = require('components/errors').factory;
const SeriesResponse = require('./SeriesResponse');

const AUTH_HEADER = 'authorization';

module.exports.storeSeriesData = R.curryN(4, storeSeriesData);

/** POST /events/:event_id/series - Store data in a series. 
 */
function storeSeriesData(ctx: Context, req: express$Request, res: express$Response, next: (err: any) => void) {
  const series = ctx.series;
  const metadata = ctx.metadata; 
  
  // Extract parameters from request: 
  const eventId = req.params.event_id;
  const accessToken = req.headers[AUTH_HEADER];

  // If params are not there, abort. 
  // TODO test this
  if (accessToken == null) return next(errors.missingHeader(AUTH_HEADER));
  if (eventId == null) return next(errors.invalidItemId());
  
  // Access check: Can user write to this series? 
  const seriesMeta = metadata.forSeries(eventId, accessToken);
  if (! seriesMeta.canWrite()) return next(errors.forbidden());

  // Parse request
  const data = parseData(req.body);
  if (data == null) {
    return next(errors.invalidRequestStructure('Malformed request.'));
  }

  // assert: data != null
  
  // Store data
  // TODO derieve namespace from user id
  series.get('test', 'series1')
    .then((series) => series.append(data))
    .then(() => {
      res
        .status(200)
        .json({status: 'ok'});
    })
    .catch((err) => next(err));
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

/** Represents the type of a row in influx input data.
 */
class InfluxRowType {
  eventType: Type; 
  
  constructor(eventType: Type) {
    this.eventType = eventType; 
  }
  
  /** Returns the type of a single cell with column name `name`. 
   */
  forCell(name: string): Type  {
    if (name === 'timestamp') {
      return new InfluxDateType();
    }
    else {
      return this.eventType.forField(name);
    }
  }
}

import type DataMatrix from 'business';

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
  
  const fields = checkFields(createRequest.fields);
  const points = createRequest.points; 

  if (fields == null || points == null) return null; 
  if (! (points instanceof Array)) return null; 
  
  // assert: fields, points ar both arrays
  
  const type = new InfluxRowType(
    business.types.lookup('mass/kg'));

  const matrix = new business.series.DataMatrix(fields, points);
  matrix.transform((columnName, cellValue) => {
    const cellType = type.forCell(columnName);
    return cellType.coerce(cellValue);
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
