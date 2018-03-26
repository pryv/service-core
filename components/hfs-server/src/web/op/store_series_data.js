// @flow

//  POST /events/:event_id/series - Store data in a series. 

const errors = require('components/errors').factory;
const business = require('components/business');

const ApiConstants = require('../api_constants');
const TracedOperations = require('./traced_operations');

import type { TypeRepository } from 'components/business';
import type Context from '../../context';
import type {SeriesMetadata} from '../../metadata_cache';

/** POST /events/:event_id/series - Store data in a series. 
 */
async function storeSeriesData(ctx: Context, 
  req: express$Request, res: express$Response)
{
  const trace = new TracedOperations(ctx);
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
  trace.start('seriesMeta/load');
  const seriesMeta = await metadata.forSeries(userName, eventId, accessToken);
  trace.finish('seriesMeta/load');
  
  // No access permission: Abort.
  if (!seriesMeta.canWrite()) throw errors.forbidden();
  
  // Parse request
  trace.start('parseData');
  const data = parseData(req.body, seriesMeta, ctx.typeRepository);
  if (data == null) {
    throw errors.invalidRequestStructure('Malformed request.');
  }
  trace.finish('parseData');

  // assert: data != null

  // Store data
  trace.start('append');
  const seriesInstance = await series.get(...seriesMeta.namespaceAndName());
  await seriesInstance.append(data);
  trace.finish('append'); 
  
  trace.start('metadataUpdate');
  await ctx.metadataUpdater.scheduleUpdate({ // async, not waiting for answer
    userId: userName, 
    eventId: eventId, 
    
    author: accessToken, 
    timestamp: new Date() * 1e9, 
    dataExtent: {
      from: new Date() * 1e9, // TODO WRONG
      to: new Date() * 1e9, 
    }
  });
  trace.finish('metadataUpdate');
  
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
