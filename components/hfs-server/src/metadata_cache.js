// @flow

const async = require('async');
const R = require('ramda');
const bluebird = require('bluebird');
const LRU = require('lru-cache');
const debug = require('debug')('metadata_cache');

const storage = require('components/storage');
const MethodContext = require('components/model').MethodContext;
const errors = require('components/errors').factory;
const { InfluxRowType } = require('components/business').types;

import type { LRUCache } from 'lru-cache';

import type { TypeRepository } from 'components/business';
import type { Logger } from 'components/utils';

/** A repository for meta data on series. 
 */
export interface MetadataRepository {
  forSeries(userName: string, eventId: string, accessToken: string): Promise<SeriesMetadata>;
}

/** Meta data on series. 
 */
export interface SeriesMetadata {
  // Returns true if write access to the series is allowed.
  canWrite(): boolean;
  
  // Returns true if read access to the series is allowed. 
  canRead(): boolean;
  
  // Returns a namespace/database name and a series name for use with InfluxDB. 
  namespaceAndName(): [string, string];
  
  // Return the InfluxDB row type for the given event. 
  produceRowType(repo: TypeRepository): InfluxRowType; 
}

// A single HFS server will keep at maximum this many credentials in cache.
const LRU_CACHE_SIZE = 10000;

// Credentials will be cached for at most this many ms. 
const LRU_CACHE_MAX_AGE_MS = 1000*60*5; // 5 mins

/** Holds metadata related to series for some time so that we don't have to 
 * compile it every time we store data in the server. 
 * 
 * Caches data about a series first by `accessToken`, then by `eventId`. 
 * */
class MetadataCache implements MetadataRepository {
  loader: MetadataRepository;
  cache: LRUCache<string, SeriesMetadata>; 
  
  constructor(metadataLoader: MetadataRepository) {
    this.loader = metadataLoader;
    
    const options = {
      max: LRU_CACHE_SIZE,
      maxAge: LRU_CACHE_MAX_AGE_MS,
    };
    this.cache = LRU(options);
  }
  
  async forSeries(userName: string, eventId: string, accessToken: string): Promise<SeriesMetadata> {
    const key = [userName, eventId, accessToken].join('/'); 
    const cache = this.cache; 
    
    const cachedValue = cache.get(key);
    if (cachedValue !== undefined) {
      debug(`Using cached credentials for ${userName} / ${eventId}.`);
      return cachedValue;
    }
      
    const newValue = await this.loader.forSeries(userName, eventId, accessToken); 
    
    cache.set(key, newValue);
    
    return newValue;
  }
}

/** Loads metadata related to a series from the main database. 
 */
class MetadataLoader {
  databaseConn: storage.Database; 
  storage: storage.StorageLayer;
  
  constructor(databaseConn: storage.Database, logger: Logger) {
    this.databaseConn = databaseConn; 
    // NOTE We pass bogus values to the last few arguments of StorageLayer - 
    // we're not using anything but the 'events' collection. Anyhow - these 
    // should be abstracted away from the storage. Also - this is currently  
    // a prototype, so we are allowed to do this. 
    const sessionMaxAge = 3600 * 1000;
    this.storage = new storage.StorageLayer(
      databaseConn, logger, 
      'attachmentsDirPath', 'previewsDirPath', 10, sessionMaxAge);
  }
  
  forSeries(userName: string, eventId: string, accessToken: string): Promise<SeriesMetadata> {
    const storage = this.storage; 
    
    // Retrieve Access (including accessLogic)
    const customAuthStep = null;
    const methodContext = new MethodContext(userName, accessToken, customAuthStep);
    
    return bluebird.fromCallback((returnValueCallback) => {
      async.series(
        [
          (next) => toCallback(methodContext.retrieveUser(storage), next),
          (next) => toCallback(methodContext.retrieveExpandedAccess(storage), next), 
          function loadEvent(done) { // result is used in success handler!
            const user = methodContext.user; 
            const query = {id: eventId};
            const findOpts = null; 

            storage.events.findOne(user, query, findOpts, done);
          },
        ], 
        (err, results) => {
          if (err != null) return returnValueCallback(
            mapErrors(err));

          const access = methodContext.access;
          const user = methodContext.user;
          const event = R.last(results);

          // Because we called retrieveExpandedAccess above.
          if (access == null) throw new Error('AF: access != null');
          // Because we called retrieveUser above.
          if (user == null) throw new Error('AF: user != null');
          
          if (event === null) return returnValueCallback(errors.unknownResource('event', eventId));

          returnValueCallback(null,
            new SeriesMetadataImpl(access, user, event));
        }
      );
    });
    
    function mapErrors(err: mixed): Error {
      if (! (err instanceof Error)) 
        return new Error(err);
      
      // else
      return err; 
    }
    
    function toCallback(promise, next) {
      return bluebird.resolve(promise).asCallback(next);
    }
  }
}

type AccessModel = {
  canContributeToStream(streamId: string): boolean; 
  canReadStream(streamId: string): boolean; 
};
type EventModel = {
  id: string, 
  streamId: string, 
  type: string,
}; 
type UserModel = { 
  id: string, 
  username: string, 
};


/** Metadata on a series, obtained from querying the main database. 
 *
 * NOTE Instances of this class get stored in RAM for some time. This is the
 *  reason why we don't store everything about the event and the user here, 
 *  only things that we subsequently need for our operations. 
 */
class SeriesMetadataImpl implements SeriesMetadata {
  permissions: {
    write: boolean, 
    read: boolean, 
  }
  
  userName: string; 
  eventId: string; 
  
  eventType: string; 
  
  constructor(access: AccessModel, user: UserModel, event: EventModel) {
    const streamId = event.streamId; 

    this.permissions = {
      write: access.canContributeToStream(streamId),
      read: access.canReadStream(streamId),
    };
    this.userName = user.username; 
    this.eventId = event.id; 
    
    this.eventType = event.type; 
  }
  
  canWrite(): boolean {
    return this.permissions.write; 
  }
  canRead(): boolean {
    return this.permissions.read;
  }
  
  namespaceAndName(): [string, string] {
    return [
      `user.${this.userName}`, 
      `event.${this.eventId}`,
    ];
  }

  // Return the InfluxDB row type for the given event. 
  produceRowType(repo: TypeRepository): InfluxRowType {
    const type = repo.lookup(this.eventType);
    
    // NOTE The instanceof check here serves to make flow-type happy about the
    //  value we'll return from this function. If duck-typing via 'isSeries' is
    //  ever needed, you'll need to find a different way of providing the same
    //  static guarantee (think interfaces...).
    if (! type.isSeries() || !(type instanceof InfluxRowType))
      throw errors.invalidOperation(
        "High Frequency data can only be stored in events whose type starts with 'series:'.");
    
    return type; 
  }
}

module.exports = {
  MetadataLoader: MetadataLoader, 
  MetadataCache: MetadataCache,
};
