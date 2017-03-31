// @flow

const business = require('components/business');

const {MetadataLoader, MetadataCache} = require('./metadata_cache');

import type {Database} from 'components/storage';
import type {MetadataRepository} from './metadata_cache';

type Repository = business.series.Repository;
type InfluxConnection = business.series.InfluxConnection; 

/** Application context object, holding references to all major subsystems. 
 * Once the system is initialized, these instance references will not change 
 * any more and together make up the configuration of the system. 
 */
class Context {
  series: Repository; 
  metadata: MetadataRepository;
  
  constructor(influxConn: InfluxConnection, mongoConn: Database) {
    this.series = new business.series.Repository(influxConn);
    this.metadata = this.produceMetadataCache(mongoConn);
  }
  
  produceMetadataCache(mongoConn: Database): MetadataRepository {
    return new MetadataCache(
      new MetadataLoader(mongoConn));
  }
}

module.exports = Context;
