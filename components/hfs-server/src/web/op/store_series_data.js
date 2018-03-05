// @flow

//  POST /events/:event_id/series - Store data in a series. 

const errors = require('components/errors').factory;
const business = require('components/business');

const Api = require('../../api_constants');

import type { TypeRepository } from 'components/business';
import type Context from '../../context';
import type {SeriesMetadata} from '../../metadata_cache';

/** POST /events/:event_id/series - Store data in a series. 
 */
async function storeSeriesData(ctx: Context, 
  req: express$Request, res: express$Response)
{
  const series = ctx.series;
  const metadata = ctx.metadata;

  // Extract parameters from request: 
  const userName = req.params.user_name;
  const eventId = req.params.event_id;
  const accessToken = req.headers[Api.AUTH_HEADER];

  // If params are not there, abort. 
  if (accessToken == null) throw errors.missingHeader(Api.AUTH_HEADER);
  if (eventId == null) throw errors.invalidItemId();
  
  // Access check: Can user write to this series? 
  const seriesLoadSpan = ctx.childSpan(req, 'seriesMeta/load');
  const seriesMeta = await metadata.forSeries(userName, eventId, accessToken);
  seriesLoadSpan.finish(); 
  
  // No access permission: Abort.
  if (!seriesMeta.canWrite()) throw errors.forbidden();
  
  // Parse request
  const parseDataSpan = ctx.childSpan(req, 'parseData');
  const data = parseData(req.body, seriesMeta, ctx.typeRepository);
  if (data == null) {
    throw errors.invalidRequestStructure('Malformed request.');
  }
  parseDataSpan.finish();

  // assert: data != null

  // Store data
  const appendSpan = ctx.childSpan(req, 'append');
  const seriesInstance = await series.get(...seriesMeta.namespaceAndName());
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
function parseData(createRequest: mixed, meta: SeriesMetadata, typeRepo: TypeRepository): ?DataMatrix {
  if (createRequest == null) return null; 
  if (typeof createRequest !== 'object') return null; 
  
  // assert: createRequest is a {}
  
  if (createRequest.format !== Api.FORMAT_FLAT_JSON) return null; 
  
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

module.exports = storeSeriesData;
