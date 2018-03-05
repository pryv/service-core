
// @flow

const errors = require('components/errors').factory;
const business = require('components/business');

const Api = require('../../api_constants');

import type Context from '../../context';
import type {SeriesMetadata} from '../../metadata_cache';

async function storeSeriesBatch(ctx: Context, 
  req: express$Request, res: express$Response)
{
  const seriesRepository = ctx.series; 
  
  // const userName = req.params.user_name;
  // const accessToken = req.headers[Api.AUTH_HEADER];
  
  // If params are not there, abort. 
  // if (accessToken == null) throw errors.missingHeader(Api.AUTH_HEADER);
  
  const data = parseData(req.body);
  const dataByNamespace = groupByNamespace(data);
  
  for (const [ns, batchRequest] of dataByNamespace.entries()) {
    const batch = seriesRepository.makeBatch(ns);
  }
  
  res
    .status(200)
    .json({status: 'ok'});
}

type DataMatrix = business.series.DataMatrix;
type BatchRequestElement = [SeriesMetadata, Array<DataMatrix>]; 
type BatchRequest = Array<BatchRequestElement>; 

// Parses the request body and transforms the data contained in it into the 
// BatchRequest format. 
// 
function parseData(batchRequest: mixed): BatchRequest {
  return [];
}

// The API level batch request might contain multiple pieces that store to the
// same namespace. This maps namespace strings to the data that needs to be
// stored. 
// 
type NamespacedBatchRequests = Map<string, BatchRequest>; 

// Introduces another level into the data structure `batchRequest` - grouping 
// requests by series namespace. This will allow then creating one batch
// request by influx namespace and doing all of these requests in parallel. 
// 
function groupByNamespace(batchRequest: BatchRequest): NamespacedBatchRequests {
  return new Map(); 
}

module.exports = storeSeriesBatch;