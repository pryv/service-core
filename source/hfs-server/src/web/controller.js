// @flow

const business = require('components/business');
const SeriesResponse = require('./SeriesResponse');

/** POST /events/:event_id/series - Store data in a series. 
 */
module.exports.storeSeriesData = 
function storeSeriesData(req: express$Request, res: express$Response) {
  // if (! business.access.canWriteToSeries(eventId, authToken)) {
  //   throw errors.forbidden(); 
  // }
  // 
  // const data = parseData(req);
  // 
  // const series = business.series.get(eventId);
  // series.append(data);
  // 
  res
    .status(200)
    .json({status: 'ok'});
};

/** Parses request data into a data matrix that can be used as input to the
 * influx store. You should give this method the `req.body`.
 * 
 * @param createRequest {Object} Deserialized JSON from the client
 * @return {DataMatrix} normalized data to be input to influx
 * @throw {Error} when the request is malformed
 */
function parseData(createRequest: Object): DataMatrix {
  
}


/** GET /events/:event_id/series - Query a series for a data subset.
 *  
 * @param  {type} req: express$Request  description 
 * @param  {type} res: express$Response description 
 * @return {type}                       description 
 */ 
module.exports.querySeriesData = 
function querySeriesData(req: express$Request, res: express$Response) {
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
};
