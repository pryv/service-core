
// @flow

const bluebird = require('bluebird');

const errors = require('components/errors').factory;
const business = require('components/business');

const BatchRequest = business.series.BatchRequest;

const ApiConstants = require('../api_constants');

import type Context from '../../context';
import type { InfluxRowType } from 'components/business'; 

async function storeSeriesBatch(ctx: Context, 
  req: express$Request, res: express$Response)
{
  const seriesRepository = ctx.series; 
  
  const userName = req.params.user_name;
  const accessToken = req.headers[ApiConstants.AUTH_HEADER];
  
  // If params are not there, abort. 
  if (accessToken == null) throw errors.missingHeader(ApiConstants.AUTH_HEADER);
  
  // Parse the data and resolve access rights and types.
  const resolver = new EventTypeResolver(userName, accessToken, ctx);
  const data = await parseData(req.body, resolver);

  // Iterate over all separate namespaces and store the data:
  const dataByNamespace = await groupByNamespace(data, resolver);
  const results = [];
  for (const [ns, data] of dataByNamespace.entries()) {
    const batch = await seriesRepository.makeBatch(ns);
    
    results.push(
      batch.store(data));
  }
  
  // Wait for all store operations to complete. 
  await bluebird.all(results);
  
  res
    .status(200)
    .json({status: 'ok'});
}

// Parses the request body and transforms the data contained in it into the 
// BatchRequest format. 
// 
function parseData(batchRequestBody: mixed, resolver: EventTypeResolver): Promise<BatchRequest> {
  return BatchRequest.parse(
    batchRequestBody, 
    resolver.resolverFun());
}

// Resolves eventIds to types for matrix verification. 
// 
// Contains a cache that will avoid loading the same event meta data twice
// during a single request;  but note that there is another cache one layer
// below. This is not strictly  neccessary, but a good practice given the
// requirements here (SOP).
// 
class EventTypeResolver {
  userName: string; 
  accessToken: string; 
  
  ctx: Context;
  
  constructor(userName, accessToken, ctx) {
    this.userName = userName;
    this.accessToken = accessToken; 
    this.ctx = ctx;
  }
  
  // Loads an event, checks access rights for the current token, then looks 
  // up the type of the event and returns it as an InfluxRowType.
  // 
  async resolve(eventId: string): Promise<InfluxRowType> {
    const ctx = this.ctx; 
    const repo = ctx.typeRepository;
    
    const seriesMeta = await this.getSeriesMeta(eventId);

    // TODO
    // if (! seriesMeta.canWrite()) 
    //   throw errors.forbidden(); 
    
    return seriesMeta.produceRowType(repo);
  }
  
  async getSeriesMeta(eventId) {
    const ctx = this.ctx; 

    const loader = ctx.metadata;

    // TODO Cache
    return loader.forSeries(this.userName, eventId, this.accessToken);
  }
  
  resolverFun() {
    return (eventId) => this.resolve(eventId);
  }
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
// NOTE Since namespaces are currently determined only by the username and 
//  since this request hardly gets handed two usernames at once, this will 
//  currently always return a map with one entry. This doesn't make the 
//  code harder to write; but it is more correct, since SOP.
// 
async function groupByNamespace(batchRequest, resolver): Promise<NamespacedBatchRequests> {
  const nsToBatch: NamespacedBatchRequests = new Map(); 
  
  for (const element of batchRequest.elements()) {
    const eventId = element.eventId;
    const seriesMeta = await resolver.getSeriesMeta(eventId);
    
    const [namespace, name] = seriesMeta.namespaceAndName(); // eslint-disable-line no-unused-vars
    storeToMap(namespace, element);
  }
  
  return nsToBatch;
  
  function storeToMap(namespace, batchRequestElement) {
    if (! nsToBatch.has(namespace)) {
      nsToBatch.set(namespace, new BatchRequest());
    }

    const batch = nsToBatch.get(namespace);
    if (batch == null) throw new Error('AF: batch cannot be null');
    
    batch.append(batchRequestElement);
  }
}

module.exports = storeSeriesBatch;