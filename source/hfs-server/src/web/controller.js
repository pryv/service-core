// @flow

import type Context from '../context';

// TODO if possible, find a more elegant way to link to error
const ServiceNotAvailableError: string =
  require('../../../../node_modules/influx/lib/src/pool')
    .ServiceNotAvailableError().constructor.name;

const {tryCoerceStringValues} = require('../../../api-server/src/schema/validation');

const R = require('ramda');
const timestamp = require('unix-timestamp');

const business = require('components/business');
const errors = require('components/errors').factory;
const SeriesResponse = require('./SeriesResponse');

const AUTH_HEADER = 'authorization';
const FORMAT_FLAT_JSON = 'flatJSON';

module.exports.storeSeriesData = R.curryN(4, storeSeriesData);

/** POST /events/:event_id/series - Store data in a series. 
 */
function storeSeriesData(ctx: Context, 
  req: express$Request, res: express$Response, next: express$NextFunction) 
{
  const series = ctx.series;
  const metadata = ctx.metadata;

  // Extract parameters from request: 
  const userName = req.params.user_name;
  const eventId = req.params.event_id;
  const accessToken = req.headers[AUTH_HEADER];

  // If params are not there, abort. 
  if (accessToken == null) return next(errors.missingHeader(AUTH_HEADER));
  if (eventId == null) return next(errors.invalidItemId());
  
  // Access check: Can user write to this series? 
  const seriesMeta = metadata.forSeries(userName, eventId, accessToken);
  return seriesMeta
    // Not found: At this point an access problem.
    .catch(() => { throw errors.forbidden(); })
    .then((seriesMeta) => {
      // No access permission: Abort.
      if (!seriesMeta.canWrite()) throw errors.forbidden();
      
      // Parse request
      const data = parseData(req.body);
      if (data == null) {
        return next(errors.invalidRequestStructure('Malformed request.'));
      }

      // assert: data != null

      // Store data
      return series.get(...seriesMeta.namespace())
        .then((seriesInstance) => seriesInstance.append(data))
        .then(() => {
          res
            .status(200)
            .json({status: 'ok'});
        });
    })
    .catch(dispatchErrors.bind(null, next));
}

/** Handles errors that might happen during a controller execution that are 
 * translated into a client error. 
 */
function dispatchErrors(next: express$NextFunction, err: any) {
  if (err.constructor.name === ServiceNotAvailableError) {
    return next(errors.apiUnavailable(err.message));
  }
  if (err instanceof business.types.errors.InputTypeError) {
    return next(errors.invalidRequestStructure(err.message));
  }
  
  return next(err);
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
  
  const typeRepo = new business.types.TypeRepository(); 
  const type = new business.types.InfluxRowType(
    typeRepo.lookup('mass/kg')); // TODO
    
  if (! type.validateColumns(fields)) return null; 
  if (! type.validateAllRows(points, fields)) return null; 
  
  const matrix = new business.series.DataMatrix(fields, points);
  
  try {
    matrix.transform((columnName, cellValue) => {
      const cellType = type.forField(columnName);
      
      const coercedValue = cellType.coerce(cellValue);
      return coercedValue; 
    });
  }
  catch (e) {
    return null; 
  }
    
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
 * @param  {type} ctx:  Context
 * @param  {type} req:  express$Request       description
 * @param  {type} res:  express$Response      description
 * @param  {type} next: express$NextFunction  description
 * @return {void}
 */
function querySeriesData(ctx: Context, req: express$Request,
                         res: express$Response, next: express$NextFunction): void {

  const metadata = ctx.metadata;
  const seriesRepo = ctx.series;

  // Extract parameters from request:
  const username = req.params.user_name;
  const eventId = req.params.event_id;
  const accessToken: ?string = req.headers[AUTH_HEADER];

  // If required params are not there, abort.
  if (accessToken == null) return next(errors.missingHeader(AUTH_HEADER));
  if (eventId == null) return next(errors.invalidItemId());

  coerceAndValidateParams(R.clone(req.query))
    .then(applyDefaultValues)
    .then(verifyAccess.bind(null, username, eventId, accessToken, metadata))
    .then(retrievePoints.bind(null, seriesRepo, res))
    .catch(dispatchErrors.bind(null, next));
}

import type Query from 'business';

function coerceAndValidateParams(params: object): Promise<Query> {
  return new Promise((accept, reject) => {

    tryCoerceStringValues(params, {
      fromTime: 'number',
      toTime: 'number'
    });

    let query = {};
    let errorsThrown = [];

    if (params.fromTime != null) {
      query.from = params.fromTime;
      if (isNaN(query.from)) {
        errorsThrown.push({
          message: 'Expected type number but found type not-a-number',
          parameter: 'fromTime',
          method: 'series.get'
        });
      }
    }

    if (params.toTime != null) {
      query.to = query.toTime;
      if (isNaN(query.to)) {
        errorsThrown.push({
          message: 'Expected type number but found type not-a-number',
          parameter: 'toTime',
          method: 'series.get'
        });
      }
    }

    if (errorsThrown.length > 0) {
      return reject(errors.invalidParametersFormat(
        'The parameters\' format is invalid.',
        errorsThrown));
    }
    accept(query);
  });
}

function applyDefaultValues(query: object): Promise<Query> {
  //TODO currently the default values are the same as for events.get, to review
  return new Promise((accept, reject) => {
    if (query.from === null && query.to !== null) {
      // TODO test this, default value setting
      query.from = timestamp.add(query.to, -24 * 60 * 60);
    }
    if (query.from !== null && query.to === null) {
      // TODO test this, default value setting
      query.to = timestamp.now(); // default value: now, can omit this as it is the default value in influxDB
    }
    if (query.from === null && query.to === null) {
      query.from = timestamp.now('-1h')
    }
    accept(query);
  });
}

function verifyAccess(username: string, eventId: string, authToken: string, metadata: any, query: Query): Promise<Query> {
  return new Promise((accept, reject) => {

    metadata.forSeries(username, eventId, authToken)
      .catch(() => {
        return reject(errors.forbidden());
      })
      .then((seriesMeta) => {
        if (!seriesMeta.canRead()) throw errors.forbidden();
        // TODO figure out how to call these promises correctly
        accept(query);
      });
  });

}

function retrievePoints(seriesRepo: any, res: express$Response, query: Query): void {
  // TODO find a way to get access to seriesMeta.namespace() or username/eventId here
  return seriesRepo.get('test', 'series1')
    .then((seriesInstance) => seriesInstance.query(query))
    .then((data) => {
      const responseObj = new SeriesResponse(data);

      responseObj.answer(res);
    });
}
