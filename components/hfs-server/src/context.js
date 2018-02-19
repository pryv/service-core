// @flow

const lodash = require('lodash');

const business = require('components/business');

const {MetadataLoader, MetadataCache} = require('./metadata_cache');
const cls = require('./tracing/cls');

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
  
  // Starts a child span below the request span. 
  // 
  childSpan(req: express$Request, name: string, opts?: Object): Span {
    const tracer = this.tracer; 
    const rootSpan = cls.getRootSpan();
    
    const spanOpts = lodash.extend({}, 
      { childOf: rootSpan }, 
      opts);
    
    return tracer.startSpan(name, spanOpts);
  }
}

module.exports = Context;
