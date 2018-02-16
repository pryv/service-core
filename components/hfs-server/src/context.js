// @flow

const lodash = require('lodash');

const business = require('components/business');

const {MetadataLoader, MetadataCache} = require('./metadata_cache');

import type {MetadataRepository} from './metadata_cache';
import type {Logger} from 'components/utils';

type Repository = business.series.Repository;
type InfluxConnection = business.series.InfluxConnection; 

type Database = {}; // NOTE anything but null for now.

import type { Tracer, Span } from 'opentracing';

/** Application context object, holding references to all major subsystems. 
 * Once the system is initialized, these instance references will not change 
 * any more and together make up the configuration of the system. 
 */
class Context {
  series: Repository; 
  metadata: MetadataRepository;
  
  // Application level performance and error tracing:
  tracer: Tracer; 
  
  typeRepository: business.types.TypeRepository;
  
  constructor(
    influxConn: InfluxConnection, mongoConn: Database, 
    modelLogger: Logger, tracer: Tracer, 
    typeRepoUpdateUrl: string) 
  {
    this.series = new business.series.Repository(influxConn);
    this.metadata = this.produceMetadataCache(mongoConn, modelLogger);
    
    this.tracer = tracer;
    
    const typeRepo = this.typeRepository = new business.types.TypeRepository(); 
    typeRepo.tryUpdate(typeRepoUpdateUrl);
  }
  
  produceMetadataCache(mongoConn: Database, logger: Logger): MetadataRepository {
    return new MetadataCache(
      new MetadataLoader(mongoConn, logger));
  }
  
  // Delegates to the current configured opentracing implementation. 
  // 
  startSpan(...a: Array<mixed>): Span {
    const tracer = this.tracer; 
    
    return tracer.startSpan(...a);
  }
  
  // Starts a child span below the request span. 
  // 
  childSpan(req: express$Request, name: string, opts?: Object): Span {
    const tracer = this.tracer; 
    
    // FLOW Of type 'opentracing.Span?' - if it is null, startSpan ignores this.
    const requestSpan = req.span; 
    if (requestSpan == null) 
      throw new Error("Current request doesn't have a span associated.");
    
    const spanOpts = lodash.extend({}, 
      { childOf: requestSpan }, 
      opts);
    
    return tracer.startSpan(name, spanOpts);
  }
}

module.exports = Context;
