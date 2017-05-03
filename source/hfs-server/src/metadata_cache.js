// @flow

const async = require('async');
const R = require('ramda');
const bluebird = require('bluebird');

const storage = require('components/storage');
const MethodContext = require('components/model').MethodContext;
const errors = require('components/errors').factory;

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
  namespace(): [string, string];
}

/** Holds metadata related to series for some time so that we don't have to 
 * compile it every time we store data in the server. 
 * 
 * Caches data about a series first by `accessToken`, then by `eventId`. 
 * */
class MetadataCache implements MetadataRepository {
  loader: MetadataRepository;
  
  constructor(metadataLoader: MetadataRepository) {
    this.loader = metadataLoader;
  }
  
  forSeries(userName: string, eventId: string, accessToken: string): Promise<SeriesMetadata> {
    // TODO implement caching
    return this.loader.forSeries(userName, eventId, accessToken); 
  }
}

/** Loads metadata related to a series from the main database. 
 */
class MetadataLoader {
  databaseConn: storage.Database; 
  storage: { events: storage.user.Events };
  
  constructor(databaseConn: storage.Database) {
    this.databaseConn = databaseConn; 
    this.storage = {
      users: new storage.Users(databaseConn),
      sessions: new storage.Sessions(databaseConn),
      
      events: new storage.user.Events(databaseConn),
      streams: new storage.user.Streams(databaseConn),
      accesses: new storage.user.Accesses(databaseConn), 
    };
  }
  
  forSeries(userName: string, eventId: string, accessToken: string): Promise<SeriesMetadata> {
    const storage = this.storage; 
    
    // Retrieve Access (including accessLogic)
    const methodContext = new MethodContext(userName, accessToken, storage);
    
    return bluebird.fromCallback((returnValueCallback) => {
      async.series(
        [
          methodContext.retrieveUser.bind(methodContext),
          methodContext.retrieveExpandedAccess.bind(methodContext), 
          function loadEvent(done) { // result is used in success handler!
            const user = methodContext.user; 
            const query = {id: eventId};
            const findOpts = null; 

            storage.events.findOne(user, query, findOpts, done);
          },
        ], 
        (err, results) => {
          if (err) return returnValueCallback(errors.unexpectedError(err));

          const access = methodContext.access;
          const user = methodContext.user;
          const event = R.last(results);

          if (event === null) return returnValueCallback(errors.unknownResource('event', eventId));

          returnValueCallback(null,
            new SeriesMetadataImpl(access, user, event));
        }
      );
    });
  }
}

type AccessModel = {
  canContributeToStream(streamId: string): boolean; 
  canReadStream(streamId: string): boolean; 
};
type EventModel = {
  id: string, 
  streamId: string
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
  
  constructor(access: AccessModel, user: UserModel, event: EventModel) {
    const streamId = event.streamId; 
    
    this.permissions = {
      write: access.canContributeToStream(streamId),
      read: access.canReadStream(streamId),
    };
    this.userName = user.username; 
    this.eventId = event.id; 
  }
  
  canWrite(): boolean {
    return this.permissions.write; 
  }
  canRead(): boolean {
    return this.permissions.read;
  }
  
  namespace(): [string, string] {
    return [
      `user.${this.userName}`, 
      `event.${this.eventId}`,
    ];
  }
}

module.exports = {
  MetadataLoader: MetadataLoader, 
  MetadataCache: MetadataCache,
};
