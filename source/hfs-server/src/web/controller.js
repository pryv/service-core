// @flow

import type {DataMatrix} from 'components/business';
import type Context from './context';

const R = require('ramda');

const business = require('components/business');
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
  if (typeof req.body !== 'object' || req.body == null) {
    // TODO subdivise errors here?
    throw new Error('Must have a JSON body');
  }
  const data = parseData(req.body);
  
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

/** Parses request data into a data matrix that can be used as input to the
 * influx store. You should give this method the `req.body`.
 * 
 * @param createRequest {Object} Deserialized JSON from the client
 * @return {DataMatrix} normalized data to be input to influx
 * @throw {Error} when the request is malformed
 */
function parseData(createRequest: Object): DataMatrix {
  // TODO validate using a schema
  
  // const hasFields = R.map(R.has(R.__, createRequest)); // (fields)
  return new business.series.DataMatrix(
    createRequest.fields, createRequest.points);
}

module.exports.querySeriesData = R.curryN(4, querySeriesData);

type TimeExpression = Date | number | null; 
type Query = {
  from?: TimeExpression, 
  to?: TimeExpression,
}

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
  console.log(params);
  if (params.fromTime != null) query.from = interpret(params.fromTime, table);
  if (params.toTime != null) query.to = interpret(params.fromTime, table);
  console.log(query);

  // TODO Query validity check...
  
  return query; 
}
