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
  const seriesFut = sr.get('test');
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

module.exports.querySeriesData = R.curryN(3, querySeriesData);

/** GET /events/:event_id/series - Query a series for a data subset.
 *  
 * @param  {type} req: express$Request  description 
 * @param  {type} res: express$Response description 
 * @return {type}                       description 
 */ 
function querySeriesData(ctx: Context, req: express$Request, res: express$Response) {
  // if (! business.access.canReadFromSeries(eventId, authToken)) {
  //   throw errors.forbidden(); 
  // }
  // 
  // query = parseQueryFromGET(req);
  // 
  // const series = business.series.get(eventId);
  // const data = series.runQuery(query);
  // 
  const fakeData = new business.series.DataMatrix(
    ['timestamp', 'value'], [[1, 2], [3, 4], [5, 6]]); 
  const responseObj = new SeriesResponse(fakeData);
  
  responseObj.answer(res);
}
