/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const async = require('async');
const MongoClient = require('mongodb').MongoClient;
const lodash = require('lodash');
const bluebird = require('bluebird');

const { getLogger } = require('@pryv/boiler');

import type { Db as MongoDB, Collection }  from 'mongodb';


type DatabaseOptions = {
  writeConcern: {
    j?: boolean,
    w?: number, 
  },
  autoReconnect?: boolean,
  connectTimeoutMS?: number, 
  socketTimeoutMS?: number, 
}

/**
 * Handles actual interaction with the Mongo database.
 * It handles Mongo-specific tasks such as connecting, retrieving collections and applying indexes,
 * exposing data querying and manipulation methods.
 *
 * All exposed methods expect a "collection info" object with properties `name` and `indexes`, e.g.
 *    {
 *      name: 'collection-name',
 *      indexes: [
 *        { index: {'field-1': 1}, options: {unique: true} },
 *        { index: {'field-2': 1}, options: {} }
 *      ]
 *    }
 *
 */
class Database {
  connectionString: string;
  databaseName: string;
  options: DatabaseOptions;
  
  db: MongoDB; 
  client: MongoClient;
  
  initializedCollections: { [name: string]: boolean }; 
  
  logger; 
  
  constructor(settings: Object) {
    const authPart = getAuthPart(settings);
    this.logger = getLogger('database');

    this.connectionString = `mongodb://${authPart}${settings.host}:${settings.port}/${settings.name}`;
    this.databaseName = settings.name; 
    this.options = {
      writeConcern: {
        j: true, // Requests acknowledgement that the write operation has been written to the journal.
        w: 1,   // Requests acknowledgement that the write operation has propagated.
      },
      connectTimeoutMS: settings.connectTimeoutMS, 
      socketTimeoutMS: settings.socketTimeoutMS, 
      useNewUrlParser: true,
      appname: 'pryv.io core',
      useUnifiedTopology: true,
    };

    this.db = null;
    this.initializedCollections = {};


    this.collectionConnectionsCache = {};
  }

  /**
   * Waits until DB engine is up. For use at startup.
   */
  waitForConnection(callback: DatabaseCallback) {
    let connected = false;
    const isConnected = () => connected;
    
    async.doUntil(
      checkConnection.bind(this), isConnected, callback);

    /**
     * @this {Database}
     */
    function checkConnection(checkDone: () => mixed) {
      this.ensureConnect((err) => {
        if (err != null) {
          this.logger.warn('Cannot connect to ' + this.connectionString + ', retrying in a sec');
          return setTimeout(checkDone, 1000);
        }
        connected = true;
        checkDone();
      });
    }
  }

  /**
   * @api private
   */
  ensureConnect(callback: DatabaseCallback) {
    // this check does not work.
    if (this.db) {
      return callback();
    }
    this.logger.debug('Connecting to ' + this.connectionString);
    MongoClient.connect(this.connectionString, this.options, (err, client) => {
      if (err != null) {
        this.logger.debug(err);
        return callback(err);
      }

      this.logger.debug('Connected');
      this.client = client;
      this.db = client.db(this.databaseName);

      client.db('admin').command({ setFeatureCompatibilityVersion: "4.0" }, {}, callback);
    });
  }

  addUserIdToIndexIfNeeded(collectionInfo) {
    // force all indexes to have userId -- ! Order is important
    if (collectionInfo.useUserId) {
      const newIndexes = [{index: { userId : 1}, options: {}}];
      for (var i = 0; i < collectionInfo.indexes.length; i++) {
        const tempIndex = {userId: 1};
        for (var property in collectionInfo.indexes[i].index) {
          if (collectionInfo.indexes[i].index.hasOwnProperty(property)) {
            tempIndex[property] = collectionInfo.indexes[i].index[property];
          }
        }
        newIndexes.push({index: tempIndex, options: collectionInfo.indexes[i].options});
      }
      collectionInfo.indexes = newIndexes;
    }
    return collectionInfo;
  }

  // Internal function. 
  // 
  async getCollection(collectionInfo: CollectionInfo, callback: ?GetCollectionCallback) {
    try {    
      // Make sure we have a connect
      await bluebird.fromCallback(  cb => this.ensureConnect(cb) ); 

      if (this.collectionConnectionsCache[collectionInfo.name]) {
        if (callback != null) {
          return callback(null, this.collectionConnectionsCache[collectionInfo.name]);
        } 
        return this.collectionConnectionsCache[collectionInfo.name];
      }
        
      // Load the collection
      const db = this.db; 
      const collection: Collection = db.collection(collectionInfo.name);

      this.addUserIdToIndexIfNeeded(collectionInfo);

      // Ensure that proper indexing is initialized
      await ensureIndexes.call(this, collection, collectionInfo.indexes);
      
      this.collectionConnectionsCache[collectionInfo.name] = collection;
      // returning the collection.
      if (callback != null) {
        return callback(null, collection);
      }
      return collection;
    }
    catch (err) {
      if (callback != null) {
        return callback(err);
      } 
      throw err;
    }
    
    // Called with `this` set to the Database instance. 
    // 
    async function ensureIndexes(collection: Collection, indexes) {
      const initializedCollections = this.initializedCollections; 
      const collectionName: string = collection.collectionName;
      if (indexes == null) return; 
      if (initializedCollections[collectionName]) return; 
      for (const item of indexes) {
        const options = lodash.merge({}, item.options, {
          background: true
        });
       
        await collection.createIndex(item.index, options);
      }

      initializedCollections[collectionName] = true;
    }
  }

  


  // Internal function. Does the same job as `getCollection` above, but calls `errCallback`
  // when error would not be null. Otherwise it calls '`callback`, whose code can 
  // assume that there has been no error. 
  // 
  // This should allow you to turn this bit of code: 
  // 
  //    this.getCollection(collectionInfo, (err, coll) => {
  //      if (err) return callback(err);
  //      ...
  //    }
  // 
  // into this: 
  // 
  //    this.getCollectionSafe(collectionInfo, callback, (collection) => {
  //      ...
  //    }
  // 
  async getCollectionSafe(
    collectionInfo: CollectionInfo, 
    errCallback: DatabaseCallback, block: UsesCollectionBlock) 
  {
    return await this.getCollection(collectionInfo, (err, coll) => {
      if (err != null) return errCallback(err);
      
      return block(coll);
    });
  }
  
  /**
   * Counts all documents in the collection.

   * @param {Object} collectionInfo
   * @param {Function} callback
   */
  countAll(collectionInfo: CollectionInfo, callback: DatabaseCallback) {
    if (collectionInfo.name == 'streams') tellMeIfStackDoesNotContains(['LocalUserStreams.js'], {for: collectionInfo.name});
    if (collectionInfo.useUserId) {
      return this.count(collectionInfo, {}, callback);
    }

    this.getCollectionSafe(collectionInfo, callback, collection => {
      collection.countDocuments(callback);
    });
  }

  /**
   * Add User Id to Object or To all Items of an Array
   *
   * @param collectionInfo
   * @param {Object|Array} mixed
   */
  addUserIdIfneed(collectionInfo: CollectionInfo, mixed) {

    if (collectionInfo.useUserId) {
      if (mixed.constructor === Array) {
        const length = mixed.length;
        for (var i = 0; i < length; i++) {
          addUserIdProperty(mixed[i]);
        }
      } else {
        addUserIdProperty(mixed);
      }
    }

    function addUserIdProperty(object) {
      object.userId = collectionInfo.useUserId;
    }
  }

  /**
   * Counts documents matching the given query.
   *
   * @param {Object} collectionInfo
   * @param {Object} query
   * @param {Function} callback
   */
  count(collectionInfo: CollectionInfo, query: {}, callback: DatabaseCallback) {
    if (collectionInfo.name == 'streams') tellMeIfStackDoesNotContains(['LocalUserStreams.js'], {for: collectionInfo.name});
    this.addUserIdIfneed(collectionInfo, query);
    this.getCollectionSafe(collectionInfo, callback, collection => {
      collection.find(query).count(callback);
    });
  }

  /**
   * Finds all documents matching the given query.
   *
   * @param {Object} collectionInfo
   * @param {Object} query Mongo-style query
   * @param {Object} options Properties:
   *    * {Object} projection Mongo-style fields inclusion/exclusion definition
   *    * {Object} sort Mongo-style sorting definition
   *    * {Number} skip Number of records to skip (or `null`)
   *    * {Number} limit Number of records to return (or `null`)
   * @param {Function} callback
   */
  findCursor(collectionInfo: CollectionInfo, query: {}, options: FindOptions, callback: DatabaseCallback) {
    if (collectionInfo.name == 'streams') tellMeIfStackDoesNotContains(['LocalUserStreams.js'], {for: collectionInfo.name});
    this.addUserIdIfneed(collectionInfo, query);
    this.getCollectionSafe(collectionInfo, callback, collection => {
      const queryOptions = {
        projection: options.projection,
      };

      let cursor = collection
        .find(query, queryOptions)
        .sort(options.sort);
      
      if (options.skip != null) {
        cursor = cursor.skip(options.skip);
      }
      if (options.limit != null) {
        cursor = cursor.limit(options.limit);
      }
      
      return callback(null, cursor);
    });
  }

   /**
   * Finds all documents matching the given query.
   *
   * @param {Object} collectionInfo
   * @param {Object} query Mongo-style query
   * @param {Object} options Properties:
   *    * {Object} projection Mongo-style fields inclusion/exclusion definition
   *    * {Object} sort Mongo-style sorting definition
   *    * {Number} skip Number of records to skip (or `null`)
   *    * {Number} limit Number of records to return (or `null`)
   * @param {Function} callback
   */
  find(collectionInfo: CollectionInfo, query: {}, options: FindOptions, callback: DatabaseCallback) {
    this.findCursor(collectionInfo, query, options, (err, cursor: Object) => {
      if (err) return callback(err);
      return cursor.toArray(callback);
    });
  }


  /**
   * Finds all documents matching the given query and returns a readable stream.
   *
   * @param {Object} collectionInfo
   * @param {Object} query Mongo-style query
   * @param {Object} options Properties:
   *    * {Object} projection Mongo-style fields inclusion/exclusion definition
   *    * {Object} sort Mongo-style sorting definition
   *    * {Number} skip Number of records to skip (or `null`)
   *    * {Number} limit Number of records to return (or `null`)
   * @param {Function} callback
   */
  findStreamed(
    collectionInfo: CollectionInfo, 
    query: {}, options: FindOptions, 
    callback: DatabaseCallback) 
  {
    this.findCursor(collectionInfo, query, options, (err, cursor: Object) => {
      if (err) return callback(err);
      callback(null, cursor.stream());
    });
  }

  /**
   * Finds the first document matching the given query.
   *
   * @param {Object} collectionInfo
   * @param {Object} query Mongo-style query
   * @param {Object} options Mongo-style options
   * @param {Function} callback
   */
  findOne(collectionInfo: CollectionInfo, query: Object, options: FindOptions, callback: DatabaseCallback) {
    if (collectionInfo.name == 'streams') tellMeIfStackDoesNotContains(['LocalUserStreams.js'], {for: collectionInfo.name});
    this.addUserIdIfneed(collectionInfo, query);
    this.getCollectionSafe(collectionInfo, callback, collection => {
      collection.findOne(query, options || {}, callback);
    });
  }

  /**
   * Inserts a single item (must have a valid id).
   *
   * @param {Object} collectionInfo
   * @param {Object} item
   * @param {Function} callback
   */
  insertOne (collectionInfo: CollectionInfo, item: Object, callback: DatabaseCallback, options: Object = {}) {
    if (collectionInfo.name == 'events') tellMeIfStackDoesNotContains(['LocalUserEvents.js'], {for: collectionInfo.name});
    this.addUserIdIfneed(collectionInfo, item);
    this.getCollectionSafe(collectionInfo, callback, collection => {
      collection.insertOne(item, options, (err, res) => {
        if (err != null) {
          Database.handleDuplicateError(err);
        }
        callback(err, res);
      });
    });
  }

  /**
   * Inserts an array of items (each item must have a valid id already).
   */
  insertMany (collectionInfo: CollectionInfo, items: Array<Object>, callback: DatabaseCallback, options: Object = {}) {
    if (collectionInfo.name == 'events') tellMeIfStackDoesNotContains(['LocalUserEvents.js'], {for: collectionInfo.name});
    this.addUserIdIfneed(collectionInfo, items);
    this.getCollectionSafe(collectionInfo, callback, collection => {
      collection.insertMany(items, options, (err, res) => {
        if (err != null) {
          Database.handleDuplicateError(err);
        }
        callback(err, res);
      });
    });
  }

  /**
   * Applies the given update to the document matching the given query.
   * Does *not* return the document.
   *
   * @param {Object} collectionInfo
   * @param {Object} query
   * @param {Object} update
   * @param {Function} callback
   */
  updateOne (collectionInfo: CollectionInfo, query: Object, update: Object, callback: DatabaseCallback, options: Object = {}) {
    if (collectionInfo.name == 'events') tellMeIfStackDoesNotContains(['LocalUserEvents.js'], {for: collectionInfo.name});
    this.addUserIdIfneed(collectionInfo, query);
    this.getCollectionSafe(collectionInfo, callback, collection => {
      collection.updateOne(query, update, options, (err, res) => {
        if (err != null) {
          Database.handleDuplicateError(err);
        }
        callback(err,res);
      });
    });
  }

  /**
   * Applies the given update to the document(s) matching the given query.
   * Does *not* return the document(s).
   *
   * @param {Object} collectionInfo
   * @param {Object} query
   * @param {Object} update
   * @param {Function} callback
   */
  updateMany(collectionInfo: CollectionInfo, query: Object, update: Object, callback: DatabaseCallback) {
    if (collectionInfo.name == 'events') tellMeIfStackDoesNotContains(['LocalUserEvents.js'], {for: collectionInfo.name});
    this.addUserIdIfneed(collectionInfo, query);
    this.getCollectionSafe(collectionInfo, callback, collection => {
      collection.updateMany(query, update, {}, callback);
    });
  }

  /**
   * Execute N requests directly on the DB
   */
  async bulkWrite(collectionInfo: CollectionInfo, requests: Array<Object>) {
    const collection = await bluebird.fromCallback(cb => this.getCollection(collectionInfo, cb));
    return await collection.bulkWrite(requests);
  }

  /**
   * Applies the given update to the document matching the given query, returning the updated
   * document.
   *
   * @param {Object} collectionInfo
   * @param {Object} query
   * @param {Object} update
   * @param {Function} callback
   */
  findOneAndUpdate(collectionInfo: CollectionInfo, query: Object, update: Object, callback: DatabaseCallback) {
    if (collectionInfo.name == 'events') tellMeIfStackDoesNotContains(['LocalUserEvents.js', 'callbackIntegrity'], {for: collectionInfo.name});
    this.addUserIdIfneed(collectionInfo, query);
    this.getCollectionSafe(collectionInfo, callback, collection => {
      collection.findOneAndUpdate(query, update, { returnDocument: 'after' }, function (err, r) {
        if (err != null) {
          Database.handleDuplicateError(err);
          return callback(err);
        }
        callback(null, r && r.value);
      });
    });
  }

  /**
   * Inserts or update the document matching the query.
   *
   * @param {Object} collectionInfo
   * @param {Object} query
   * @param {Object} update
   * @param {Function} callback
   */
  upsertOne(collectionInfo: CollectionInfo, query: Object, update: Object, callback: DatabaseCallback) {
    if (collectionInfo.name == 'events') tellMeIfStackDoesNotContains(['LocalUserEvents.js'], {for: collectionInfo.name});
    this.addUserIdIfneed(collectionInfo, query);
    this.getCollectionSafe(collectionInfo, callback, collection => {
      collection.updateOne(query, update, {upsert: true}, callback);
    });
  }

  /**
   * Deletes the document matching the given query.
   *
   * @param {Object} collectionInfo
   * @param {Object} query
   * @param {Function} callback
   */
  deleteOne(collectionInfo: CollectionInfo, query: Object, callback: DatabaseCallback) {
    if (collectionInfo.name == 'events') tellMeIfStackDoesNotContains(['LocalUserEvents.js'], {for: collectionInfo.name});
    this.addUserIdIfneed(collectionInfo, query);
    this.getCollectionSafe(collectionInfo, callback, collection => {
      collection.deleteOne(query, {}, callback);
    });
  }

  /**
   * Deletes the document(s) matching the given query.
   *
   * @param {Object} collectionInfo
   * @param {Object} query
   * @param {Function} callback
   */
  deleteMany(collectionInfo: CollectionInfo, query: Object, callback: DatabaseCallback) {
    if (collectionInfo.name == 'events') tellMeIfStackDoesNotContains(['LocalUserEvents.js'], {for: collectionInfo.name});
    this.addUserIdIfneed(collectionInfo, query);
    this.getCollectionSafe(collectionInfo, callback, collection => {
      collection.deleteMany(query, {}, callback);
    });
  }

  /**
   * Get collection total size.
   * In case of singleCollectionMode count the number of documents
   *
   * @param {Object} collectionInfo
   * @param {Function} callback
   */
  totalSize(collectionInfo: CollectionInfo, callback: DatabaseCallback) {
    if (collectionInfo.name == 'events') tellMeIfStackDoesNotContains(['LocalUserEvents.js'], {for: collectionInfo.name});
    if (collectionInfo.useUserId) {
      return this.countAll(collectionInfo, callback);
    }
    this.getCollectionSafe(collectionInfo, callback, collection => {
      collection.stats(function (err, stats) {
        if (err != null) {
          // assume collection doesn't exist
          return callback(null, 0);
        }
        callback(null, getTotalSizeFromStats(stats));
      });
    });
  }

  /**
   * @param {Function} callback
   */
  dropCollection(collectionInfo: CollectionInfo, callback: DatabaseCallback) {
    if (collectionInfo.name == 'events') tellMeIfStackDoesNotContains(['LocalUserEvents.js'], {for: collectionInfo.name});
    if (collectionInfo.useUserId) {
      return this.deleteMany(collectionInfo, {}, callback);
    } else {
      return this.getCollectionSafe(collectionInfo, callback, collection => {
        collection.drop(callback);
      });
    }
  }

  /**
   * Primarily meant for tests.
   *
   * @param {Function} callback
   */
  dropDatabase(callback: DatabaseCallback) {
    this.ensureConnect(function (err) {
      if (err) { return callback(err); }
      this.db.dropDatabase(callback);
    }.bind(this));
  }

  /**
   * Primarily meant for tests
   *
   * @param {Object} collectionInfo
   * @param {Object} options
   * @param {Function} callback
   */
  listIndexes(collectionInfo: CollectionInfo, options: {}, callback: DatabaseCallback) {
    this.getCollectionSafe(collectionInfo, callback, (collection) => {
      collection.listIndexes(options).toArray(callback);
    });
  }

  // class utility functions

  static isDuplicateError(err: ?MongoDBError) {
    if (err == null) { return false; }
    var errorCode = err.code || (err.lastErrorObject ? err.lastErrorObject.code : null);
    return errorCode === 11000 || errorCode === 11001;
  }

  static handleDuplicateError(err: MongoDBError) {
    err.isDuplicate = Database.isDuplicateError(err);
    err.isDuplicateIndex = (key) => {
      if (err != null && err.errmsg != null && err.isDuplicate) {
        // This check depends on the MongoDB storage engine
        // We assume WiredTiger here (and not MMapV1).
        const matching = err.errmsg.match(/index:(.+) dup key:/);
        if (Array.isArray(matching) && matching.length >= 2) {
          const matchingKeys = matching[1];
          return matchingKeys.includes(` ${key}`) || matchingKeys.includes(`_${key}_`);
        }
      }
      return false;
    };
  }

  /// Closes this database connection. After calling this, all other methods 
  /// will produce undefined behaviour. 
  /// 
  async close() {
    return this.client.close();
  }

  async startSession () {
    const session = this.client.startSession();
    return session;
  }
}

module.exports = Database;

type MongoDBError = {
  errmsg?: string,
  code?: number, 
  lastErrorObject?: MongoDBError,
  isDuplicate?: boolean,
  isDuplicateIndex?: (key: string) => boolean,
  getDuplicateSystemStreamId?: () => string,
}

type UpdateIfNeededCallback = (item: Object) => Object | null;

type DatabaseCallback = (err?: Error | null, result?: mixed) => mixed;
type GetCollectionCallback = 
  (err?: ?Error, collection?: ?Collection) => mixed;


type UsesCollectionBlock = (coll: Collection) => mixed; 

// Information about a MongoDB collection. 
type CollectionInfo = {
  name: string, 
  indexes: Array<IndexDefinition>, 
}

// Information about an index we create in a mongodb collection. 
export type IndexDefinition = {
  index: { [field: string]: number }, 
  options: IndexOptions,
}
type IndexOptions = {
  unique?: boolean, 
}

type FindOptions = {
  projection: { [key: string]: (0 | 1) },
  sort: Object, 
  skip: ?number, 
  limit: ?number, 
}
  
function getAuthPart(settings) {
  const authUser = settings.authUser;
  let authPart = '';
  
  if (authUser != null && typeof authUser === 'string' && authUser.length > 0) {
    const authPassword = settings.authPassword || '';
    
    // See
    //  https://github.com/mongodb/specifications/blob/master/source/connection-string/connection-string-spec.rst#key-value-pair
    // 
    authPart = encodeURIComponent(authUser) + ':' + 
      encodeURIComponent(authPassword) + '@';
  }
  
  return authPart;
}

function getTotalSizeFromStats(stats) {
  // written according to http://docs.mongodb.org/manual/reference/command/collStats/
  return stats.count * 16 + // ie. record headers
      stats.size +
      stats.totalIndexSize;
}

function tellMeIfStackDoesNotContains(needles, info) {
  const e = new Error();
  const stack = e.stack.split('\n').filter(l => l.indexOf('node_modules') <0 ).filter(l => l.indexOf('node:') < 0).slice(1, 100);
  for (const needle of needles) {
    if (stack.some(l => l.indexOf(needle) >= 0)) {
      return true;
    }
  }
  console.log(info, stack);
  return false;
}