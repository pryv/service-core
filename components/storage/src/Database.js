/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const MongoClient = require('mongodb').MongoClient;
const _ = require('lodash');
const util = require('util');
const { setTimeout } = require('timers/promises');

const { getLogger } = require('@pryv/boiler');

/**
 * @typedef {{
 *   writeConcern: {
 *     j?: boolean;
 *     w?: number;
 *   };
 *   autoReconnect?: boolean;
 *   connectTimeoutMS?: number;
 *   socketTimeoutMS?: number;
 * }} DatabaseOptions
 */

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
  connectionString;
  databaseName;
  options;

  /**
   * @type {boolean}
   */
  connecting;
  db;
  client;

  initializedCollections;

  logger;

  constructor (settings) {
    const authPart = getAuthPart(settings);
    this.logger = getLogger('database');
    this.connectionString = `mongodb://${authPart}${settings.host}:${settings.port}/`;
    this.databaseName = settings.name;
    this.options = {
      writeConcern: {
        j: true,
        w: 1 // Requests acknowledgement that the write operation has propagated.
      },
      connectTimeoutMS: settings.connectTimeoutMS,
      socketTimeoutMS: settings.socketTimeoutMS,
      appname: 'pryv.io core'
    };
    this.db = null;
    this.connecting = false;
    this.initializedCollections = {};
    this.collectionConnectionsCache = {};
  }

  /**
   * Waits until DB engine is up. For use at startup.
   * @returns {Promise<void>}
   */
  async waitForConnection () {
    let connected = false;
    while (!connected) {
      try {
        await this.ensureConnect();
        connected = true;
      } catch (err) {
        this.logger.warn('Cannot connect to ' + this.connectionString + ', retrying in a sec');
        await setTimeout(1000);
        continue;
      }
    }
  }

  /**
   * @private
   * @returns {Promise<void>}
   */
  async ensureConnect () {
    while (this.connecting) {
      this.logger.debug('Connection already in progress, retrying…');
      await setTimeout(100);
    }

    if (this.db) { return; }

    this.connecting = true;
    this.logger.debug('Connecting to ' + this.connectionString);
    this.client = new MongoClient(this.connectionString, this.options);
    try {
      await this.client.connect();
      this.logger.debug('Connected');
      await this.client
        .db('admin')
        .command({ setFeatureCompatibilityVersion: '6.0' }, {});
      this.db = this.client.db(this.databaseName);
      this.connecting = false;
    } catch (err) {
      this.logger.debug(err);
      this.connecting = false;
      throw err;
    }
  }

  /**
   * @returns {any}
   */
  addUserIdToIndexIfNeeded (collectionInfo) {
    // force all indexes to have userId -- ! Order is important
    if (collectionInfo.useUserId) {
      const newIndexes = [{ index: { userId: 1 }, options: {} }];
      for (let i = 0; i < collectionInfo.indexes.length; i++) {
        const tempIndex = { userId: 1 };
        for (const property in collectionInfo.indexes[i].index) {
          if (collectionInfo.indexes[i].index[property] != null) {
            tempIndex[property] = collectionInfo.indexes[i].index[property];
          }
        }
        newIndexes.push({
          index: tempIndex,
          options: collectionInfo.indexes[i].options
        });
      }
      collectionInfo.indexes = newIndexes;
    }
    return collectionInfo;
  }

  /**
   * @protected
   * @param {CollectionInfo} collectionInfo
   * @returns {Promise<any>}
   */
  async getCollection (collectionInfo) {
    await this.ensureConnect();
    if (this.collectionConnectionsCache[collectionInfo.name]) {
      return this.collectionConnectionsCache[collectionInfo.name];
    }
    const collection = this.db.collection(collectionInfo.name);
    this.addUserIdToIndexIfNeeded(collectionInfo);
    await this.ensureIndexes(collection, collectionInfo.indexes);
    this.collectionConnectionsCache[collectionInfo.name] = collection;
    return collection;
  }

  /**
   * @private
   * @param {Collection} collection
   * @returns {Promise<void>}
   */
  async ensureIndexes (collection, indexes) {
    const initializedCollections = this.initializedCollections;
    const collectionName = collection.collectionName;
    if (indexes == null) { return; }
    if (initializedCollections[collectionName]) { return; }
    for (const item of indexes) {
      const options = _.merge({}, item.options, {
        background: true
      });
      await collection.createIndex(item.index, options);
    }
    initializedCollections[collectionName] = true;
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
  /**
   * @param {CollectionInfo} collectionInfo
   * @param {DatabaseCallback} errCallback
   * @param {CollectionCallback} collCallback
   * @returns {void}
   */
  getCollectionSafe (collectionInfo, errCallback, collCallback) {
    this.getCollection(collectionInfo).then(collCallback, errCallback);
  }

  /**
   * Counts all documents in the collection.
   * @param {CollectionInfo} collectionInfo  undefined
   * @param {DatabaseCallback} callback  undefined
   * @returns {void}
   */
  countAll (collectionInfo, callback) {
    if (collectionInfo.name === 'streams') {
      tellMeIfStackDoesNotContains(['localUserStreams.js'], {
        for: collectionInfo.name
      });
    }
    if (collectionInfo.useUserId) {
      return this.count(collectionInfo, {}, callback);
    }
    this.getCollectionSafe(collectionInfo, callback, (collection) => {
      collection.countDocuments(callback);
    });
  }

  /**
   * Add User Id to Object or To all Items of an Array
   *
   * @param {CollectionInfo} collectionInfo  undefined
   * @param {Object|Array} mixed
   * @returns {void}
   */
  addUserIdIfneed (collectionInfo, mixed) {
    if (collectionInfo.useUserId) {
      if (mixed.constructor === Array) {
        const length = mixed.length;
        for (let i = 0; i < length; i++) {
          addUserIdProperty(mixed[i]);
        }
      } else {
        addUserIdProperty(mixed);
      }
    }
    function addUserIdProperty (object) {
      object.userId = collectionInfo.useUserId;
    }
  }

  /**
   * Counts documents matching the given query.
   *
   * @param {CollectionInfo} collectionInfo  undefined
   * @param {{}} query  undefined
   * @param {DatabaseCallback} callback  undefined
   * @returns {void}
   */
  count (collectionInfo, query, callback) {
    if (collectionInfo.name === 'streams') {
      tellMeIfStackDoesNotContains(['localUserStreams.js'], {
        for: collectionInfo.name
      });
    }
    this.addUserIdIfneed(collectionInfo, query);
    this.getCollectionSafe(collectionInfo, callback, (collection) => {
      collection.countDocuments(query, callback);
    });
  }

  /**
   * Finds all documents matching the given query.
   *
   * @param {CollectionInfo} collectionInfo  undefined
   * @param {{}} query  Mongo-style query
   * @param {FindOptions} options  Properties:
   * {Object} projection Mongo-style fields inclusion/exclusion definition
   * {Object} sort Mongo-style sorting definition
   * {Number} skip Number of records to skip (or `null`)
   * {Number} limit Number of records to return (or `null`)
   * @param {DatabaseCallback} callback  undefined
   * @returns {void}
   */
  findCursor (collectionInfo, query, options, callback) {
    if (collectionInfo.name === 'streams') {
      tellMeIfStackDoesNotContains(['localUserStreams.js'], {
        for: collectionInfo.name
      });
    }
    this.addUserIdIfneed(collectionInfo, query);
    this.getCollectionSafe(collectionInfo, callback, (collection) => {
      const queryOptions = {
        projection: options.projection
      };
      let cursor = collection.find(query, queryOptions).sort(options.sort);
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
   * @param {CollectionInfo} collectionInfo  undefined
   * @param {{}} query  Mongo-style query
   * @param {FindOptions} options  Properties:
   * {Object} projection Mongo-style fields inclusion/exclusion definition
   * {Object} sort Mongo-style sorting definition
   * {Number} skip Number of records to skip (or `null`)
   * {Number} limit Number of records to return (or `null`)
   * @param {DatabaseCallback} callback  undefined
   * @returns {void}
   */
  find (collectionInfo, query, options, callback) {
    this.findCursor(collectionInfo, query, options, (err, cursor) => {
      if (err) { return callback(err); }
      return cursor.toArray(callback);
    });
  }

  /**
   * Finds all documents matching the given query and returns a readable stream.
   *
   * @param {CollectionInfo} collectionInfo  undefined
   * @param {{}} query  Mongo-style query
   * @param {FindOptions} options  Properties:
   * {Object} projection Mongo-style fields inclusion/exclusion definition
   * {Object} sort Mongo-style sorting definition
   * {Number} skip Number of records to skip (or `null`)
   * {Number} limit Number of records to return (or `null`)
   * @param {DatabaseCallback} callback  undefined
   * @returns {void}
   */
  findStreamed (collectionInfo, query, options, callback) {
    this.findCursor(collectionInfo, query, options, (err, cursor) => {
      if (err) { return callback(err); }
      callback(null, cursor.stream());
    });
  }

  /**
   * Finds the first document matching the given query.
   *
   * @param {CollectionInfo} collectionInfo  undefined
   * @param {any} query  Mongo-style query
   * @param {FindOptions} options  Mongo-style options
   * @param {DatabaseCallback} callback  undefined
   * @returns {void}
   */
  findOne (collectionInfo, query, options, callback) {
    if (collectionInfo.name === 'streams') {
      tellMeIfStackDoesNotContains(['localUserStreams.js'], {
        for: collectionInfo.name
      });
    }
    this.addUserIdIfneed(collectionInfo, query);
    this.getCollectionSafe(collectionInfo, callback, (collection) => {
      collection.findOne(query, options || {}, callback);
    });
  }

  /**
   * Inserts a single item (must have a valid id).
   *
   * @param {CollectionInfo} collectionInfo  undefined
   * @param {any} item  undefined
   * @param {DatabaseCallback} callback  undefined
   * @param {any} options
   * @returns {void}
   */
  insertOne (collectionInfo, item, callback, options = {}) {
    if (collectionInfo.name === 'streams') {
      tellMeIfStackDoesNotContains(['localUserStreams.js'], {
        for: collectionInfo.name
      });
    }
    this.addUserIdIfneed(collectionInfo, item);
    this.getCollectionSafe(collectionInfo, callback, (collection) => {
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
   * @param {CollectionInfo} collectionInfo
   * @param {Array<any>} items
   * @param {DatabaseCallback} callback
   * @param {any} options
   * @returns {void}
   */
  insertMany (collectionInfo, items, callback, options = {}) {
    if (collectionInfo.name === 'streams') {
      tellMeIfStackDoesNotContains(['localUserStreams.js'], {
        for: collectionInfo.name
      });
    }
    this.addUserIdIfneed(collectionInfo, items);
    this.getCollectionSafe(collectionInfo, callback, (collection) => {
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
   * @param {CollectionInfo} collectionInfo  undefined
   * @param {any} query  undefined
   * @param {any} update  undefined
   * @param {DatabaseCallback} callback  undefined
   * @param {any} options
   * @returns {void}
   */
  updateOne (collectionInfo, query, update, callback, options = {}) {
    if (collectionInfo.name === 'streams') {
      tellMeIfStackDoesNotContains(['localUserStreams.js'], {
        for: collectionInfo.name
      });
    }
    this.addUserIdIfneed(collectionInfo, query);
    this.getCollectionSafe(collectionInfo, callback, (collection) => {
      collection.updateOne(query, update, options, (err, res) => {
        if (err != null) {
          Database.handleDuplicateError(err);
        }
        callback(err, res);
      });
    });
  }

  /**
   * Applies the given update to the document(s) matching the given query.
   * Does *not* return the document(s).
   *
   * @param {CollectionInfo} collectionInfo  undefined
   * @param {any} query  undefined
   * @param {any} update  undefined
   * @param {DatabaseCallback} callback  undefined
   * @returns {void}
   */
  updateMany (collectionInfo, query, update, callback) {
    if (collectionInfo.name === 'streams') {
      tellMeIfStackDoesNotContains(['localUserStreams.js'], {
        for: collectionInfo.name
      });
    }
    this.addUserIdIfneed(collectionInfo, query);
    this.getCollectionSafe(collectionInfo, callback, (collection) => {
      collection.updateMany(query, update, {}, callback);
    });
  }

  /**
   * Execute N requests directly on the DB
   * @param {CollectionInfo} collectionInfo
   * @param {Array<any>} requests
   * @returns {Promise<any>}
   */
  async bulkWrite (collectionInfo, requests) {
    const collection = await this.getCollection(collectionInfo);
    return await collection.bulkWrite(requests);
  }

  /**
   * Applies the given update to the document matching the given query, returning the updated
   * document.
   *
   * @param {CollectionInfo} collectionInfo  undefined
   * @param {any} query  undefined
   * @param {any} update  undefined
   * @param {DatabaseCallback} callback  undefined
   * @returns {void}
   */
  findOneAndUpdate (collectionInfo, query, update, callback) {
    if (collectionInfo.name === 'streams') { tellMeIfStackDoesNotContains(['localUserStreams.js', 'callbackIntegrity'], { for: collectionInfo.name }); }
    this.addUserIdIfneed(collectionInfo, query);
    this.getCollectionSafe(collectionInfo, callback, (collection) => {
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
   * @param {CollectionInfo} collectionInfo  undefined
   * @param {any} query  undefined
   * @param {any} update  undefined
   * @param {DatabaseCallback} callback  undefined
   * @returns {void}
   */
  upsertOne (collectionInfo, query, update, callback) {
    if (collectionInfo.name === 'streams') {
      tellMeIfStackDoesNotContains(['localUserStreamss.js'], {
        for: collectionInfo.name
      });
    }
    this.addUserIdIfneed(collectionInfo, query);
    this.getCollectionSafe(collectionInfo, callback, (collection) => {
      collection.updateOne(query, update, { upsert: true }, callback);
    });
  }

  /**
   * Deletes the document matching the given query.
   *
   * @param {CollectionInfo} collectionInfo  undefined
   * @param {any} query  undefined
   * @param {DatabaseCallback} callback  undefined
   * @returns {void}
   */
  deleteOne (collectionInfo, query, callback) {
    if (collectionInfo.name === 'streams') {
      tellMeIfStackDoesNotContains(['localUserStreams.js'], {
        for: collectionInfo.name
      });
    }
    this.addUserIdIfneed(collectionInfo, query);
    this.getCollectionSafe(collectionInfo, callback, (collection) => {
      collection.deleteOne(query, {}, callback);
    });
  }

  /**
   * Deletes the document(s) matching the given query.
   *
   * @param {CollectionInfo} collectionInfo  undefined
   * @param {any} query  undefined
   * @param {DatabaseCallback} callback  undefined
   * @returns {void}
   */
  deleteMany (collectionInfo, query, callback) {
    if (collectionInfo.name === 'streams') {
      tellMeIfStackDoesNotContains(['localUserStreams.js'], {
        for: collectionInfo.name
      });
    }
    this.addUserIdIfneed(collectionInfo, query);
    this.getCollectionSafe(collectionInfo, callback, (collection) => {
      collection.deleteMany(query, {}, callback);
    });
  }

  /**
   * Get collection total size.
   * In case of singleCollectionMode count the number of documents
   *
   * @param {CollectionInfo} collectionInfo  undefined
   * @returns {Promise<number>}
   */
  async totalSize (collectionInfo) {
    if (collectionInfo.name === 'streams') {
      tellMeIfStackDoesNotContains(['localUserStreams.js'], {
        for: collectionInfo.name
      });
    }
    if (collectionInfo.useUserId) {
      // return number of documents
      return util.promisify(this.countAll).call(this, collectionInfo);
    }
    // else use collection stats
    const collection = this.getCollection(collectionInfo);
    try {
      const stats = await collection.stats();
      return getTotalSizeFromStats(stats);
    } catch (err) {
      // assume collection doesn't exist
      return 0;
    }
  }

  /**
   * @param {DatabaseCallback} callback  *
   * @param {CollectionInfo} collectionInfo
   * @returns {void}
   */
  dropCollection (collectionInfo, callback) {
    if (collectionInfo.name === 'streams') {
      tellMeIfStackDoesNotContains(['localUserStreams.js'], {
        for: collectionInfo.name
      });
    }
    if (collectionInfo.useUserId) {
      return this.deleteMany(collectionInfo, {}, callback);
    } else {
      return this.getCollectionSafe(collectionInfo, callback, (collection) => {
        collection.drop(callback);
      });
    }
  }

  /**
   * Primarily meant for tests.
   *
   * @param {DatabaseCallback} callback  undefined
   * @returns {void}
   */
  dropDatabase (callback) {
    this.ensureConnect().then(() => {
      this.db.dropDatabase(callback);
    }, callback);
  }

  /**
   * Primarily meant for tests
   *
   * @param {CollectionInfo} collectionInfo  undefined
   * @param {{}} options  undefined
   * @param {DatabaseCallback} callback  undefined
   * @returns {void}
   */
  listIndexes (collectionInfo, options, callback) {
    this.getCollectionSafe(collectionInfo, callback, (collection) => {
      collection.listIndexes(options).toArray(callback);
    });
  }

  // class utility functions
  /** @static
   * @param {MongoDBError | null} err
   * @returns {boolean}
   */
  static isDuplicateError (err) {
    if (err == null) {
      return false;
    }
    const errorCode = err.code || (err.lastErrorObject ? err.lastErrorObject.code : null);
    return errorCode === 11000 || errorCode === 11001;
  }

  /** @static
   * @param {MongoDBError} err
   * @returns {void}
   */
  static handleDuplicateError (err) {
    err.isDuplicate = Database.isDuplicateError(err);
    err.isDuplicateIndex = (key) => {
      if (err != null && err.errmsg != null && err.isDuplicate) {
        // This check depends on the MongoDB storage engine
        // We assume WiredTiger here (and not MMapV1).
        const matching = err.errmsg.match(/index:(.+) dup key:/);
        if (Array.isArray(matching) && matching.length >= 2) {
          const matchingKeys = matching[1];
          return (matchingKeys.includes(` ${key}`) ||
                        matchingKeys.includes(`_${key}_`));
        }
      }
      return false;
    };
  }

  /// Closes this database connection. After calling this, all other methods
  /// will produce undefined behaviour.
  ///
  /**
   * @returns {Promise<any>}
   */
  async close () {
    return this.client.close();
  }

  /**
   * @returns {Promise<any>}
   */
  async startSession () {
    const session = this.client.startSession();
    return session;
  }
}

module.exports = Database;

/**
 * @typedef {{
 *   errmsg?: string;
 *   code?: number;
 *   lastErrorObject?: MongoDBError;
 *   isDuplicate?: boolean;
 *   isDuplicateIndex?: (key: string) => boolean;
 *   getDuplicateSystemStreamId?: () => string;
 * }} MongoDBError
 */

/** @typedef {(coll: Collection) => unknown} CollectionCallback */

/**
 * @typedef {object} CollectionInfo
 * @property {string } name
 * @property {Array<IndexDefinition>} [indexes]
 */

/**
 * @typedef {{
 *   index: {
 *     [field: string]: number;
 *   };
 *   options: IndexOptions;
 * }} IndexDefinition
 */

/**
 * @typedef {{
 *   unique?: boolean;
 * }} IndexOptions
 */

/**
 * @typedef {{
 *   projection: {
 *     [key: string]: 0 | 1;
 *   };
 *   sort: any;
 *   skip: number | undefined | null;
 *   limit: number | undefined | null;
 * }} FindOptions
 */

/**
 * @returns {string}
 */
function getAuthPart (settings) {
  const authUser = settings.authUser;
  let authPart = '';
  if (authUser != null && typeof authUser === 'string' && authUser.length > 0) {
    const authPassword = settings.authPassword || '';
    // See
    //  https://github.com/mongodb/specifications/blob/master/source/connection-string/connection-string-spec.rst#key-value-pair
    //
    authPart =
            encodeURIComponent(authUser) +
                ':' +
                encodeURIComponent(authPassword) +
                '@';
  }
  return authPart;
}

/**
 * @returns {number}
 */
function getTotalSizeFromStats (stats) {
  // written according to http://docs.mongodb.org/manual/reference/command/collStats/
  return (stats.count * 16 + // ie. record headers
        stats.size +
        stats.totalIndexSize);
}

/**
 * @returns {boolean}
 */
function tellMeIfStackDoesNotContains (needles, info) {
  const e = new Error();
  const stack = e.stack
    .split('\n')
    .filter((l) => l.indexOf('node_modules') < 0)
    .filter((l) => l.indexOf('node:') < 0)
    .slice(1, 100);
  for (const needle of needles) {
    if (stack.some((l) => l.indexOf(needle) >= 0)) {
      return true;
    }
  }
  console.log(info, stack);
  // throw new Error('Beep');
  return false;
}
