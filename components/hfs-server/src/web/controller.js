// @flow

import type Context from '../context';

const { tryCoerceStringValues } = require('components/api-server').validation;

const lodash = require('lodash');
const timestamp = require('unix-timestamp');

const business = require('components/business');
const errors = require('components/errors').factory;
const SeriesResponse = require('./SeriesResponse');

const AUTH_HEADER = 'authorization';
const FORMAT_FLAT_JSON = 'flatJSON';

// Repository for types that we know about. 
const typeRepo = new business.types.TypeRepository(); 

// TODO When is this type repository updated?

/** POST /events/:event_id/series - Store data in a series. 
 */
async function storeSeriesData(ctx: Context, 
  req: express$Request, res: express$Response, next: express$NextFunction)
{
  const series = ctx.series;
  const metadata = ctx.metadata;

  // Extract parameters from request: 
  const userName = req.params.user_name;
  const eventId = req.params.event_id;
  const accessToken = req.headers[AUTH_HEADER];

  // If params are not there, abort. 
  if (accessToken == null) throw errors.missingHeader(AUTH_HEADER);
  if (eventId == null) throw errors.invalidItemId();
  
  // Access check: Can user write to this series? 
  const seriesLoadSpan = ctx.childSpan(req, 'seriesMeta/load');
  const seriesMeta = await metadata.forSeries(userName, eventId, accessToken);
  seriesLoadSpan.finish(); 
  
  // No access permission: Abort.
  if (!seriesMeta.canWrite()) throw errors.forbidden();
  
  // Parse request
  const parseDataSpan = ctx.childSpan(req, 'parseData');
  const data = parseData(req.body, seriesMeta);
  if (data == null) {
    return next(errors.invalidRequestStructure('Malformed request.'));
  }
  parseDataSpan.finish();

  // assert: data != null

  // Store data
  const appendSpan = ctx.childSpan(req, 'append');
  const seriesInstance = await series.get(...seriesMeta.namespace());
  await seriesInstance.append(data);
  appendSpan.finish(); 
  
  res
    .status(200)
    .json({status: 'ok'});
}

type DataMatrix = business.series.DataMatrix;

/** Parses request data into a data matrix that can be used as input to the
 * influx store. You should give this method the `req.body`.
 * 
 * @param createRequest {mixed} Deserialized JSON from the client
 * @return {DataMatrix, null} normalized data to be input to influx
 */
function parseData(createRequest: mixed, meta: SeriesMetadata): ?DataMatrix {
  if (createRequest == null) return null; 
  if (typeof createRequest !== 'object') return null; 
  
  // assert: createRequest is a {}
  
  if (createRequest.format !== FORMAT_FLAT_JSON) return null; 
  
  const fields = checkFields(createRequest.fields);
  const points = createRequest.points; 

  if (fields == null || points == null) return null; 
  if (! (points instanceof Array)) return null; 
  
  // assert: fields, points are both arrays
  
  const type = meta.produceRowType(typeRepo);
    
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
async function querySeriesData(
  ctx: Context, req: express$Request,
  res: express$Response): mixed 
{
  const metadata = ctx.metadata;
  const seriesRepo = ctx.series;

  // Extract parameters from request:
  const username = req.params.user_name;
  const eventId = req.params.event_id;
  const accessToken: ?string = req.headers[AUTH_HEADER];

  // If required params are not there, abort.
  if (accessToken == null) throw errors.missingHeader(AUTH_HEADER);
  if (eventId == null) throw errors.invalidItemId();

  const seriesMeta = await verifyAccess(username, eventId, accessToken, metadata);
  
  const query = coerceStringParams(lodash.clone(req.query));
  applyDefaultValues(query);
  validateQuery(query);
  
  await retrievePoints(seriesRepo, res, query, seriesMeta);
}

function coerceStringParams(params: Object): Query {
  tryCoerceStringValues(params, {
    fromTime: 'number',
    toTime: 'number',
  });

  const query = {
    from: params.fromTime,
    to: params.toTime,
  };

  return query;
}

function applyDefaultValues(query: Object) {
  if (query.to == null) query.to = timestamp.now(); 
}

function validateQuery(query: Query) {
  if (query.from != null && isNaN(query.from)) 
    throw errors.invalidParametersFormat("'from' must contain seconds since epoch.");

  if (isNaN(query.to)) 
    throw errors.invalidParametersFormat("'to' must contain seconds since epoch.");
    
  if (query.from != null && query.to != null && query.to < query.from) 
    throw errors.invalidParametersFormat("'to' must be >= 'from'.");
}

async function verifyAccess(
  username: string, eventId: string, authToken: string, 
  metadata: MetadataRepository): Promise<SeriesMetadata>
{
  const seriesMeta = await metadata.forSeries(username, eventId, authToken);
  
  if (!seriesMeta.canRead()) throw errors.forbidden();
  
  return seriesMeta;
}

async function retrievePoints(
  seriesRepo: Repository, res: express$Response,
  query: Query, seriesMeta: SeriesMetadata): Promise<void>
{
  const seriesInstance = await seriesRepo.get(...seriesMeta.namespace());
  const data = await seriesInstance.query(query);
  
  const responseObj = new SeriesResponse(data);
  responseObj.answer(res);
}


// ----------------------------------------------- (sync) express error handling

type ControllerMethod = (ctx: Context, 
  req: express$Request, res: express$Response, next: express$NextFunction) => mixed; 
type ExpressHandler = (req: express$Request, res: express$Response, next: express$NextFunction) => mixed; 
function mount(ctx: Context, handler: ControllerMethod): express$Middleware {
  return catchAndNext(
    handler.bind(null, ctx)); 
}

const opentracing = require('opentracing');
import type { Span } from 'opentracing';
opaque type RequestWithSpan = express$Request & {
  span: ?Span,
}


function catchAndNext(handler: ExpressHandler): express$Middleware {
  return async (req: RequestWithSpan, res, next) => {
    const Tags = opentracing.Tags;
    const span: ?Span = req.span; 
    
    try {
      return await handler(req, res, next);
    }
    catch (err) {
      if (span != null) {
        span.setTag(Tags.ERROR, true);
        span.log({
          event: 'error',
          message: err.message,
          err });
      }
        
      if (err.constructor.name === 'ServiceNotAvailableError') {
        return next(errors.apiUnavailable(err.message));
      }
      if (err instanceof business.types.errors.InputTypeError) {
        return next(errors.invalidRequestStructure(err.message));
      }
    
      next(err);
    }
  };
}

// --------------------------------------------------------------------- factory

module.exports = function (ctx: Context) {
  return {
    storeSeriesData: mount(ctx, storeSeriesData),
    querySeriesData: mount(ctx, querySeriesData),
  };
};