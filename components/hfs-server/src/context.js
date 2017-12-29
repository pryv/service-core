// @flow

const business = require('components/business');

const {MetadataLoader, MetadataCache} = require('./metadata_cache');

import type {MetadataRepository} from './metadata_cache';
import type {Logger} from 'components/utils';

type Repository = business.series.Repository;
type InfluxConnection = business.series.InfluxConnection; 

type Database = {}; // NOTE anything but null for now.

/** Application context object, holding references to all major subsystems. 
 * Once the system is initialized, these instance references will not change 
 * any more and together make up the configuration of the system. 
 */
class Context {
  series: Repository; 
  metadata: MetadataRepository;
  
  constructor(influxConn: InfluxConnection, mongoConn: Database, modelLogger: Logger) {
    this.series = new business.series.Repository(influxConn);
    this.metadata = this.produceMetadataCache(mongoConn, modelLogger);
  }
  
  produceMetadataCache(mongoConn: Database, logger: Logger): MetadataRepository {
    return new MetadataCache(
      new MetadataLoader(mongoConn, logger));
  }
}

module.exports = Context;
