// @flow

//  POST /events/:event_id/series - Store data in a series. 

const errors = require('components/errors').factory;
const business = require('components/business');

const ApiConstants = require('../api_constants');

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
  const accessToken = req.headers[ApiConstants.AUTH_HEADER];

  // If params are not there, abort. 
  if (accessToken == null) throw errors.missingHeader(ApiConstants.AUTH_HEADER);
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

// Parses request data into a data matrix that can be used as input to the
// influx store. You should give this method the `req.body`. 
// 
function parseData(createRequest: mixed, meta: SeriesMetadata, typeRepo: TypeRepository): DataMatrix {
  try {
    const type = meta.produceRowType(typeRepo);
    
    return business.series.DataMatrix.parse(createRequest, type);
  } 
  catch (err) {
    if (err instanceof business.series.ParseFailure) {
      throw errors.invalidRequestStructure(err.message);
    }
    
    throw err; 
  }
}

module.exports = storeSeriesData;
