// @flow

const lodash = require('lodash');

const business = require('components/business');

const {MetadataLoader, MetadataCache} = require('./metadata_cache');
const metadataUpdater = require('./metadata_updater');
const Settings = require('./Settings');

const cls = require('./tracing/cls');

import type {MetadataRepository} from './metadata_cache';
import type {LogFactory, Logger} from 'components/utils';

import type { IMetadataUpdaterService } from 'components/metadata';

import type { Database } from 'components/storage';

type Repository = business.series.Repository;
type InfluxConnection = business.series.InfluxConnection; 

import type { Tracer, Span } from 'opentracing';

// Application context object, holding references to all major subsystems. Once
// the system is initialized, these instance references will not change  any
// more and together make up the configuration of the system.  
// 
class Context {
  series: Repository; 
  metadata: MetadataRepository;
  metadataUpdater: IMetadataUpdaterService;
  
  // Application level performance and error tracing:
  tracer: Tracer; 
  
  typeRepository: business.types.TypeRepository;
  settings: Settings;
  
  constructor(
    influxConn: InfluxConnection, mongoConn: Database, 
    logFactory: LogFactory, tracer: Tracer, 
    typeRepoUpdateUrl: string, settings: Settings) 
  {
    this.series = new business.series.Repository(influxConn);
    this.metadataUpdater = new metadataUpdater.MetadataForgetter(
      logFactory('metadata.update'));    
    this.tracer = tracer;
    this.settings = settings;

    this.configureTypeRepository(typeRepoUpdateUrl); 
    this.configureMetadataCache(this.series, mongoConn, logFactory('model'));
  }
  
  configureTypeRepository(url: string) {
    const typeRepo = new business.types.TypeRepository(); 
    typeRepo.tryUpdate(url); // async
    
    this.typeRepository = typeRepo;
  }
  
  configureMetadataCache(series: Repository, mongoConn: Database, logger: Logger) {
    this.metadata = new MetadataCache(series, new MetadataLoader(mongoConn, logger), this.settings);
  }
  
  // Configures the metadata updater service. 
  // 
  async configureMetadataUpdater(endpoint: string) {
    const updater = await metadataUpdater.produce(endpoint);
    
    this.metadataUpdater = updater;
  }
  
  // Starts a child span below the request span. 
  // 
  childSpan(name: string, opts?: Object): Span {
    const tracer = this.tracer; 
    const rootSpan = cls.getRootSpan();
    
    const spanOpts = lodash.extend({}, 
      { childOf: rootSpan }, 
      opts);
    
    const span = tracer.startSpan(name, spanOpts);
    
    // It becomes our new root - setRootSpan hooks the span to detect an end. 
    cls.setRootSpan(span);
    
    return span; 
  }
}
module.exports = Context;

