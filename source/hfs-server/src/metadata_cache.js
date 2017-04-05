// @flow

const async = require('async');
const R = require('ramda');
const bluebird = require('bluebird');

const storage = require('components/storage');
const MethodContext = require('components/model').MethodContext;

/** A repository for meta data on series. 
 */
export interface MetadataRepository {
  forSeries(userName: string, eventId: string, accessToken: string): Promise<SeriesMetadata>;
}

/** Meta data on series. 
 */
export interface SeriesMetadata {
  canWrite(): boolean;
}

// Declares a minimal user model to allow us to do user specific operations on 
// storage. 
type UserModel = { id: string };

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
          function loadEvent(done) {
            const user = methodContext.user; 
            const query = {id: eventId};
            const findOpts = null; 

            storage.events.findOne(user, query, findOpts, done);
          },
        ], 
        (err, results) => {
          const accesss = methodContext.accesss; 
          const user = methodContext.user; 
          const event = R.last(results);  // TODO fragile!
          
          if (err) return returnValueCallback(err);
          returnValueCallback(null, 
            new SeriesMetadataImpl(accesss, user, event));
        }
      );
    });
  }
}

type AccessModel = {};
type EventModel = {
  streamId: string
}; 

/** Metadata on a series, obtained from querying the main database. 
 *
 * NOTE Instances of this class get stored in RAM for some time. This is the
 *  reason why we don't store everything about the event and the user here, 
 *  only things that we subsequently need for our operations. 
 */
class SeriesMetadataImpl implements SeriesMetadata {
  streamId: string; 
  
  constructor(access: AccessModel, user: UserModel, event: EventModel) {
    this.streamId = event.streamId; 
  }
  
  canWrite(): boolean {
    return false; 
  }
}

module.exports = {
  MetadataLoader: MetadataLoader, 
  MetadataCache: MetadataCache,
};
