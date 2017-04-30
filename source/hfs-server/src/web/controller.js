// @flow

import type Context from '../context';

// TODO if possible, find a more elegant way to link to error
const ServiceNotAvailableError: string =
  require('../../../../node_modules/influx/lib/src/pool')
    .ServiceNotAvailableError().constructor.name;

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
function storeSeriesData(ctx: Context, req: express$Request, res: express$Response, next: (err: any) => void) {
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
    .catch(dispatchErrors.bind(next, null));
}

/** Handles errors that might happen during a controller execution that are 
 * translated into a client error. 
 */
function dispatchErrors(next: (err: any) => void, err: any) {
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
    typeRepo.lookup('mass/kg'));
    
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
 * @param  {type} req: express$Request  description 
 * @param  {type} res: express$Response description 
 * @return {type}                       description 
 */ 
function querySeriesData(ctx: Context, req: express$Request, res: express$Response, next: () => void) {
  /*
  1- validate params
  2- apply default values to optional params
  3- verify access
  4- if any, post processing or secondary call to storage
   */

  // if (! business.access.canReadFromSeries(eventId, authToken)) {
  //   throw errors.forbidden();
  // }
  //

  const seriesRepo = ctx.series;

  parseQueryFromGET(req.query)
    .catch((err) => next(err))
    .then((query) => {
      // Store data
      // TODO derive namespace from user id
      seriesRepo.get('test', 'series1')
        .then((seriesInstance) => seriesInstance.query(query))
        .then((data) => {
          const responseObj = new SeriesResponse(data);

          responseObj.answer(res);
        })
        .catch((err) => next(err));
    });
}

import type Query from 'business';
function parseQueryFromGET(params: {[key: string]: string}): Promise<Query> {
  return new Promise((accept, reject) => {

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
    const numberTable = [ // Target format is a number of seconds since Epoch
      // TODO add conversion from date formats.
      {test: /^[1-9]\d*(\.\d+)?$/, convert: parseFloat}
    ];

    let errorsThrown = [];

    if (params.fromTime != null) {
      query.from = interpret(params.fromTime, numberTable);
      if (! isNaN(query.from)) {
        errorsThrown.push({
          message: 'Expected type number but found type not-a-number',
          parameter: 'fromTime',
          method: 'series.get'
        });
      }
    } else {
      // TODO test this, default value setting
      // default value: 1 hour ago
      query.from = timestamp.now('-1h');
    }

    if (params.toTime != null) {
      query.to = interpret(params.toTime, numberTable);
      if (! isNaN(query.to)) {
        errorsThrown.push({
          message: 'Expected type number but found type not-a-number',
          parameter: 'toTime',
          method: 'series.get'
        });
      }
    } else {
      // TODO test this, default value setting
      // default value: now, can omit this as it is the default value in influxDB
      query.to = timestamp.now();
    }

    if (errorsThrown.length > 0) {
      return reject(errors.invalidParametersFormat(
        'The parameters\' format is invalid.',
        errorsThrown));
    }
    accept(query);
  });


}
