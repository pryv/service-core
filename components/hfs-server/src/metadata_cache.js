/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const async = require('async');
const R = require('ramda');
const bluebird = require('bluebird');
const LRU = require('lru-cache');
const logger = require('@pryv/boiler').getLogger('metadata_cache');

const storage = require('storage');
const MethodContext = require('model').MethodContext;
const errors = require('errors').factory;
const { InfluxRowType } = require('business').types;

const NatsSubscriber = require('api-server/src/socket-io/nats_subscriber');
const NATS_CONNECTION_URI = require('utils').messaging.NATS_CONNECTION_URI;
const NATS_UPDATE_EVENT = require('utils').messaging
  .NATS_UPDATE_EVENT;
const NATS_DELETE_EVENT = require('utils').messaging
  .NATS_DELETE_EVENT;

import type { LRUCache }  from 'lru-cache';

import type { TypeRepository, Repository } from 'business';
import type { MessageSink }  from './message_sink';

type UsernameEvent = {
  username: string,
  event: {
    id: string
  },
};

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

  // Retur true if item is trashed or deleted
  isTrashedOrDeleted(): boolean;
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
class MetadataCache implements MetadataRepository, MessageSink {
  loader: MetadataRepository;

  /**
   * Stores:
   *  - username/eventId -> [accessTokens]
   *  - accessToken -> username/eventID/accessToken
   *  - username/eventId/accessToken -> SeriesMetadataImpl (metadata_cache.js)
   */
  cache: LRUCache<string, mixed>; 
  series: Repository;

  config;

  // nats messaging
  natsUpdateSubscriber: NatsSubscriber;
  natsDeleteSubscriber: NatsSubscriber;
  sink: MessageSink;
  
  constructor(series: Repository, metadataLoader: MetadataRepository, config) {

    this.loader = metadataLoader;
    this.series = series;
    this.config = config;

    const options = {
      max: LRU_CACHE_SIZE,
      maxAge: LRU_CACHE_MAX_AGE_MS,
    };
    this.cache = LRU(options);

    // nats messages
    this.subscribeToNotifications();
  }

  // nats messages

  deliver(channel: string, usernameEvent: UsernameEvent): void {
    switch (channel) {
      case NATS_DELETE_EVENT:
        this.dropSeries(usernameEvent);
      // fall through
      case NATS_UPDATE_EVENT:
        this.invalidateEvent(usernameEvent);
        break;
      default:
        break;
    }
  }

  dropSeries(usernameEvent: UsernameEvent): Promise {
    return this.series.connection.dropMeasurement(
      'event.' + usernameEvent.event.id,
      'user.' + usernameEvent.username
    );
  }

  invalidateEvent(usernameEvent: UsernameEvent): void {
    const cache = this.cache;
    const eventKey = usernameEvent.username + '/' + usernameEvent.event.id;
    const cachedTokenListForEvent: Array<string> = cache.get(eventKey);
    if (cachedTokenListForEvent != null) { // what does this return
      cachedTokenListForEvent.map((token) => {
        cache.del(eventKey + '/' + token);
      });
    }
  }

  async subscribeToNotifications() {
    this.natsUpdateSubscriber = new NatsSubscriber(this.config.get('nats:uri'), this);
    this.natsDeleteSubscriber = new NatsSubscriber(this.config.get('nats:uri'), this);
    await this.natsUpdateSubscriber.subscribe(NATS_UPDATE_EVENT);
    await this.natsDeleteSubscriber.subscribe(NATS_DELETE_EVENT);
  }

  // cache logic
  async forSeries(userName: string, eventId: string, accessToken: string): Promise<SeriesMetadata> {
    const cache: LRUCache<string, Array<string>> = this.cache; 
    
    const key: string = [userName, eventId, accessToken].join('/'); 

    // to make sure we update the tokenList "recently used info" cache we also get eventKey
    const eventKey: string = [userName, eventId].join('/');
    const cachedTokenListForEvent: Array<string> = cache.get(eventKey);

    // also keep a list of used Token to invalidate them
    const cachedEventListForTokens: Array<string> = cache.get(accessToken);
    
    const cachedValue = cache.get(key);
    if ( cachedValue != null) {
      logger.debug(`Using cached credentials for ${userName} / ${eventId}.`);
      return cachedValue;
    }  
    const newValue = await this.loader.forSeries(userName, eventId, accessToken); 
    
    // new event we add it to the list
    if (cachedTokenListForEvent != null) {
      cache.set(eventKey, cachedTokenListForEvent.concat(accessToken));
    } else {
      cache.set(eventKey, [accessToken]);
    }

    // new token we add it to the list
    if (cachedEventListForTokens != null) {
      cache.set(accessToken, cachedEventListForTokens.concat(key));
    } else {
      cache.set(accessToken, [key]);
    }
    
    cache.set(key, newValue);
    
    return newValue;
  }
}

/** Loads metadata related to a series from the main database. 
 */
class MetadataLoader {
  databaseConn: storage.Database; 
  storage: storage.StorageLayer;
  
  constructor(databaseConn: storage.Database, logger) {
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
    
    // Retrieve Access (including AccessLogic)
    const customAuthStep = null;
    const methodContext = new MethodContext(
      userName,
      accessToken,
      customAuthStep,
      storage.events,
    );
    
    return bluebird.fromCallback((returnValueCallback) => {
      async.series(
        [
          (next) => toCallback(methodContext.retrieveUser(), next),
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
  canCreateEventsOnStream(streamId: string): boolean; 
  canGetEventsOnStream(streamId: string): boolean; 
};
type EventModel = {
  id: string, 
  streamIds: string, 
  type: string,
  time: number,
  trashed: boolean,
  deleted: number,
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
  time: number; 
  trashed: boolean;
  deleted: number;
  
  constructor(access: AccessModel, user: UserModel, event: EventModel) {
    this.permissions = definePermissions(access, event);
    this.userName = user.username; 
    this.eventId = event.id; 
    this.time = event.time;
    this.eventType = event.type; 
    this.trashed = event.trashed;
    this.deleted = event.deleted;
  }

  isTrashedOrDeleted(): boolean {
    return this.trashed || this.deleted != null;
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
    
    type.setSeriesMeta(this);
    return type; 
  }
}

function definePermissions(access: AccessModel, event: EventModel): {write: boolean, read: boolean} {
  const streamIds = event.streamIds; 
  const permissions = {
    write: false,
    read: false,
  };
  const streamIdsLength = streamIds.length;
  for(let i=0; i<streamIdsLength && ! readAndWriteTrue(permissions); i++) {
    if (access.canCreateEventsOnStream(streamIds[i])) permissions.write = true;
    if (access.canGetEventsOnStream(streamIds[i])) permissions.read = true;
  }
  return permissions;

  function readAndWriteTrue(permissions) {
    return permissions.write === true && permissions.read === true;
  }
}

module.exports = {
  MetadataLoader: MetadataLoader, 
  MetadataCache: MetadataCache,
};
