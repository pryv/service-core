// @flow

import type Context from './context';

const R = require('ramda');
const assert = require('assert');

const business = require('components/business');
const errors = require('components/errors').factory;
const SeriesResponse = require('./SeriesResponse');

module.exports.storeSeriesData = R.curryN(4, storeSeriesData);

/** POST /events/:event_id/series - Store data in a series. 
 */
function storeSeriesData(ctx: Context, req: express$Request, res: express$Response, next: (err: any) => void) {
  // if (! business.access.canWriteToSeries(eventId, authToken)) {
  //   throw errors.forbidden(); 
  // }
  // 
  // const data = parseData(req);
  // 
  // const series = business.series.get(eventId);
  // series.append(data);
  // 
  const sr = ctx.seriesRepository;
  
  // Parse request
  const data = parseData(req.body);
  if (data == null) {
    return next(errors.invalidRequestStructure('Malformed request.'));
  }

  // assert: data != null
  
  // Store data
  // TODO derieve namespace from user id
  const seriesFut = sr.get('test', 'series1');
  seriesFut
    .then((series) => series.append(data))
    .then(() => {
      res
        .status(200)
        .json({status: 'ok'});
    })
    .catch((err) => next(err));
}

import type Type from 'business';
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

type InfluxValue = number; 

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
  
  const fields = checkFields(createRequest.fields);
  const points = createRequest.points; 
  if (fields == null || points == null) return null; 
  
  const type = new InfluxRowType(
    business.types.lookup('mass/kg'));

  const matrix = new business.series.DataMatrix(fields, points);
  matrix.transform((columnName, cellValue) => {
    const cellType = type.forCell(columnName);
    return cellType.coerce(cellValue);
  });
  
  // const hasFields = R.map(R.has(R.__, createRequest)); // (fields)
  return new business.series.DataMatrix(
    fields, dataCopy);
}

function checkFields(val: any): ?Array<string> {
  if (val == null) return null; 
  if (R.type(val) !== 'Array') return null; 
  
  const allStrings = R.all(
    R.where(R.equals('String', R.type(R.__))) );
    
  if (!allStrings(val)) return null; 
  
  return allStrings;
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
  
  const sr = ctx.seriesRepository;
  const query = parseQueryFromGET(req.query);
  
  // Store data
  // TODO derieve namespace from user id
  const seriesFut = sr.get('test', 'series1');
  seriesFut
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
  const table = [
    // TODO add conversion from date formats.
    {test: /^\d+$/, convert: R.compose(
      R.constructN(1, Date), R.multiply(1000), parseInt)}, // Seconds since Unix Epoch
  ];

  if (params.fromTime != null) query.from = interpret(params.fromTime, table);
  if (params.toTime != null) query.to = interpret(params.toTime, table);

  // TODO Query validity check...
  
  return query; 
}
