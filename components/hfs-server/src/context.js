/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// 

const lodash = require('lodash');

const business = require('business');

const {MetadataLoader, MetadataCache} = require('./metadata_cache');
const metadataUpdater = require('./metadata_updater');

const cls = require('./tracing/cls');





const { getLogger } = require('@pryv/boiler');
const { getMall } = require('mall');

// Application context object, holding references to all major subsystems. Once
// the system is initialized, these instance references will not change  any
// more and together make up the configuration of the system.  
// 
class Context {
  series; 
  metadata;
  metadataUpdater;
  mongoConn;
  
  // Application level performance and error tracing:
  tracer; 
  
  typeRepository;
  config;
  
  constructor(
    influxConn, mongoConn, 
    tracer, 
    typeRepoUpdateUrl, config) 
  {
    this.series = new business.series.Repository(influxConn);
    this.metadataUpdater = new metadataUpdater.MetadataForgetter(
      getLogger('metadata.update'));    
    this.tracer = tracer;
    this.config = config;
    this.mongoConn = mongoConn;

    this.configureTypeRepository(typeRepoUpdateUrl); 
  }

  async init() {
    await  this.configureMetadataCache();
  }
  
  configureTypeRepository(url) {
    const typeRepo = new business.types.TypeRepository(); 
    typeRepo.tryUpdate(url); // async
    
    this.typeRepository = typeRepo;
  }
  
  async configureMetadataCache() {
    const mall = await getMall();
    this.metadata = new MetadataCache(this.series, new MetadataLoader(this.mongoConn, mall, getLogger('metadata-cache')), this.config);

  }
  
  // Configures the metadata updater service. 
  // 
  async configureMetadataUpdater(endpoint) {
    const updater = await metadataUpdater.produce(endpoint)   
    this.metadataUpdater = updater;
  }
  
  // Starts a child span below the request span. 
  // 
  childSpan(name, opts) {
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

