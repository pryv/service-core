// @flow

import type Context from '../context';

// TODO if possible, find a more elegant way to link to error
const ServiceNotAvailableError: string =
  require('../../../../node_modules/influx/lib/src/pool')
    .ServiceNotAvailableError().constructor.name;

const {tryCoerceStringValues} = require('../../../api-server/src/schema/validation');

const R = require('ramda');
const timestamp = require('unix-timestamp');
const bluebird = require('bluebird');

const business = require('components/business');
const errors = require('components/errors').factory;
const { APIError} = require('components/errors');
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
 * @return {DataMatrix, null} normalized data to be input to influx
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

import type {Query, Repository} from 'components/business';
import type {MetadataRepository, SeriesMetadata} from '../metadata_cache';

/** GET /events/:event_id/series - Query a series for a data subset.
 *
 * @param  {type} ctx:  Context
 * @param  {type} req:  express$Request       description
 * @param  {type} res:  express$Response      description
 * @param  {type} next: express$NextFunction  description
 * @return {void}
 */
function querySeriesData(
  ctx: Context, req: express$Request,
  res: express$Response, next: express$NextFunction): mixed 
{

  const metadata: MetadataRepository = ctx.metadata;
  const seriesRepo: Repository = ctx.series;

  // Extract parameters from request:
  const username = req.params.user_name;
  const eventId = req.params.event_id;
  const accessToken: ?string = req.headers[AUTH_HEADER];

  // If required params are not there, abort.
  if (accessToken == null) return next(errors.missingHeader(AUTH_HEADER));
  // assert: eventId is not null
  if (eventId == null) return next(errors.invalidItemId());

  coerceStringParams(R.clone(req.query))
    .then(applyDefaultValues)
    .then(validateQuery)
    .then(verifyAccess.bind(null, username, eventId, accessToken, metadata))
    .then(retrievePoints.bind(null, seriesRepo, res))
    .catch(dispatchErrors.bind(null, next));
}

function coerceStringParams(params: Object): bluebird<Query> {
  return bluebird.try(() => {
    tryCoerceStringValues(params, {
      fromTime: 'number',
      toTime: 'number',
    });

    const query = {
      from: params.fromTime,
      to: params.toTime,
    };

    return query;
  });
}

// TODO decide if default values are meant to be & test this
function applyDefaultValues(query: Object): bluebird<Query> {
  // currently the default values are the same as for events.get, to review
  return bluebird.try(() => {
    if (query.from === null && query.to !== null) {
      query.from = timestamp.add(query.to, -24 * 60 * 60);
    }
    if (query.from !== null && query.to === null) {
      // default value: now, can omit this as it is the default value in
      // influxDB
      query.to = timestamp.now(); 
    }
    if (query.from === null && query.to === null) {
      query.from = timestamp.now('-1h');
    }
    return query;
  });
}

function validateQuery(query: Query): bluebird<Query> {
  return bluebird.try(() => {

    let errorsThrown = [];

    if (query.from != null) {
      if (isNaN(query.from)) {
        errorsThrown.push({
          message: 'Expected type number but found type ' + (typeof query.from),
          parameter: 'fromTime',
          method: 'series.get'
        });
      }
    }

    if (query.to != null) {
      if (isNaN(query.to)) {
        errorsThrown.push({
          message: 'Expected type number but found type ' + (typeof query.to),
          parameter: 'toTime',
          method: 'series.get'
        });
      }
    }

    if (query.to != null && query.from != null) {
      if (query.to < query.from) {
        errorsThrown.push({
          message: 'Parameter fromTime is bigger than toTime',
          parameter: 'fromTime',
          method: 'series.get',
        });
      }
    }

    if (errorsThrown.length > 0) {
      throw errors.invalidParametersFormat(
        'The parameters\' format is invalid.',
        errorsThrown);
    }
    return query;
  });
}

function verifyAccess(
  username: string, eventId: string, authToken: string, 
  metadata: MetadataRepository, query: Query): bluebird<[Query, SeriesMetadata]>
{
  return metadata.forSeries(username, eventId, authToken)
    .catch((err) => {
      throw err instanceof APIError ? err : errors.unexpectedError(err);
    })
    .then((seriesMeta) => {
      if (!seriesMeta.canRead()) throw errors.forbidden();

      return [query, seriesMeta];
    });
}

function retrievePoints(
  seriesRepo: Repository, res: express$Response,
  queryAndSeriesMeta: [Query, SeriesMetadata]): mixed 
{
  // const query = queryAndSeriesMeta[0];
  const seriesMeta = queryAndSeriesMeta[1];
  
  return seriesRepo.get(...seriesMeta.namespace())
    .then((seriesInstance) => seriesInstance.query(queryAndSeriesMeta[0]))
    .then((data) => {
      const responseObj = new SeriesResponse(data);
      responseObj.answer(res);
    });
}
