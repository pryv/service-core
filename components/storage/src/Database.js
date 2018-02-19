const async = require('async');
const MongoClient = require('mongodb').MongoClient;
const lodash = require('lodash');
const bluebird = require('bluebird');

module.exports = Database;

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
 * @param {Object} settings
 * @param {Object} logging
 * @constructor
 */
function Database(settings, logger) {
  const authPart = getAuthPart(settings);
   
  this.connectionString = `mongodb://${authPart}${settings.host}:${settings.port}/${settings.name}`;
  this.databaseName = settings.name; 
      
  const s60 = 60000; // 60 seconds
  this.options = {
    w: 1,   // Requests acknowledgement that the write operation has propagated.
    autoReconnect: true, 
    connectTimeoutMS: s60, 
    socketTimeoutMS: s60,
  };

  this.db = null;
  this.initializedCollections = {};
  this.logger = logger; 
}

/**
 * Waits until DB engine is up. For use at startup.
 */
Database.prototype.waitForConnection = function (callback) {
  var connected = false;
  async.doUntil(checkConnection.bind(this), function () { return connected; }, callback);

  /**
   * @this {Database}
   */
  function checkConnection(checkDone) {
    this.ensureConnect(function (err) {
      if (err) {
        this.logger.warn('Cannot connect to ' + this.connectionString + ', retrying in a sec');
        return setTimeout(checkDone, 1000);
      }
      connected = true;
      checkDone();
    }.bind(this));
  }
};

/**
 * @api private
 */
Database.prototype.ensureConnect = function (callback) {
  if (this.db) {
    return callback();
  }
  this.logger.debug('Connecting to ' + this.connectionString);
  MongoClient.connect(this.connectionString, this.options, function (err, client) {
    if (err) {
      this.logger.debug(err);
      return callback(err);
    }

    this.logger.debug('Connected');
    this.client = client;
    this.db = client.db(this.databaseName);
    callback();
  }.bind(this));
};

/**
 * @api private
 */
Database.prototype.getCollection = async function (collectionInfo, callback) {
  try {    
    // Make sure we have a connect
    await bluebird.fromCallback( 
      cb => this.ensureConnect(cb) ); 
      
    // Load the collection
    const db = this.db; 
    const collection = db.collection(collectionInfo.name);
      
    // Ensure that proper indexing is initialized
    await ensureIndexes.call(this, collection, collectionInfo.indexes);
    
    // returning the collection.
    return callback(null, collection);
  }
  catch (err) {
    return callback(err);
  }
  
  // Called with `this` set to the Database instance. 
  // 
  async function ensureIndexes(collection, indexes) {
    const initializedCollections = this.initializedCollections; 
    const collectionName = collection.collectionName;
    
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
};

/**
 * Counts all documents in the collection.

 * @param {Object} collectionInfo
 * @param {Function} callback
 */
Database.prototype.countAll = function (collectionInfo, callback) {
  this.getCollection(collectionInfo, function (err, collection) {
    if (err) { return callback(err); }
    collection.count(callback);
  });
};

/**
 * Counts documents matching the given query.
 *
 * @param {Object} collectionInfo
 * @param {Object} query
 * @param {Function} callback
 */
Database.prototype.count = function (collectionInfo, query, callback) {
  this.getCollection(collectionInfo, function (err, collection) {
    if (err) { return callback(err); }
    collection.find(query).count(callback);
  });
};

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
Database.prototype.find = function (collectionInfo, query, options, callback) {
  this.getCollection(collectionInfo, function (err, collection) {
    if (err) { return callback(err); }
    
    const queryOptions = {
      projection: options.projection,
    };
    var cursor = collection.find(query, queryOptions).sort(options.sort);
    if (options.skip) {
      cursor = cursor.skip(options.skip);
    }
    if (options.limit) {
      cursor = cursor.limit(options.limit);
    }
    cursor.toArray(callback);
  });
};

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
Database.prototype.findStreamed = function (collectionInfo, query, options, callback) {
  this.getCollection(collectionInfo, function (err, collection) {
    if (err) { return callback(err); }

    const queryOptions = {
      projection: options.projection,
    };
    var cursor = collection.find(query, queryOptions).sort(options.sort);
    if (options.skip) {
      cursor = cursor.skip(options.skip);
    }
    if (options.limit) {
      cursor = cursor.limit(options.limit);
    }
    callback(null, cursor.stream());
  });
};

/**
 * Finds the first document matching the given query.
 *
 * @param {Object} collectionInfo
 * @param {Object} query Mongo-style query
 * @param {Object} options Mongo-style options
 * @param {Function} callback
 */
Database.prototype.findOne = function (collectionInfo, query, options, callback) {
  this.getCollection(collectionInfo, function (err, collection) {
    if (err) { return callback(err); }
    collection.findOne(query, options || {}, callback);
  });
};

/**
 * Aggregates documents based on the given group expression.
 *
 * @param {Object} collectionInfo
 * @param {Object} query Optional; Mongo-style query object
 * @param {Object} projectExpression Mongo-style `$project` object
 * @param {Object} groupExpression Mongo-style `$group` object
 * @param {Object} options Properties:
 *    * {Object} sort Mongo-style sorting definition
 *    * {Number} skip Number of records to skip (or `null`)
 *    * {Number} limit Number of records to return (or `null`)
 * @param {Function} callback
 */
Database.prototype.aggregate = function (
  collectionInfo, query, projectExpression, groupExpression,
  options, callback) 
{
  this.getCollection(collectionInfo, function (err, collection) {
    if (err) { return callback(err); }

    var aggregationCmds = [];
    if (query) {
      aggregationCmds.push({$match: query});
    }
    if (projectExpression) {
      aggregationCmds.push({$project: projectExpression});
    }
    if (groupExpression) {
      aggregationCmds.push({$group: groupExpression});
    }
    if (options.sort) {
      aggregationCmds.push({$sort: options.sort});
    }
    if (options.skip) {
      aggregationCmds.push({$skip: options.skip});
    }
    if (options.limit) {
      aggregationCmds.push({$limit: options.limit});
    }
    collection.aggregate(aggregationCmds, function (err, results) {
      if (err) { return callback(err); }
      callback(null, results);
    });
  });
};

/**
 * Inserts a single item (must have a valid id).
 *
 * @param {Object} collectionInfo
 * @param {Object} item
 * @param {Function} callback
 */
Database.prototype.insertOne = function (collectionInfo, item, callback) {
  this.getCollection(collectionInfo, function (err, collection) {
    if (err) { return callback(err); }
    collection.insertOne(item, {w: 1}, callback);
  });
};

/**
 * Inserts an array of items (each item must have a valid id already).
 *
 * @param {Object} collectionInfo
 * @param {Array} items
 * @param {Function} callback
 */
Database.prototype.insertMany = function (collectionInfo, items, callback) {
  this.getCollection(collectionInfo, function (err, collection) {
    if (err) { return callback(err); }
    collection.insertMany(items, {w: 1}, callback);
  });
};

/**
 * Applies the given update to the document matching the given query.
 * Does *not* return the document.
 *
 * @param {Object} collectionInfo
 * @param {Object} query
 * @param {Object} update
 * @param {Function} callback
 */
Database.prototype.updateOne = function (collectionInfo, query, update, callback) {
  this.getCollection(collectionInfo, function (err, collection) {
    if (err) { return callback(err); }
    collection.updateOne(query, update, {w: 1}, callback);
  });
};

/**
 * Applies the given update to the document(s) matching the given query.
 * Does *not* return the document(s).
 *
 * @param {Object} collectionInfo
 * @param {Object} query
 * @param {Object} update
 * @param {Function} callback
 */
Database.prototype.updateMany = function (collectionInfo, query, update, callback) {
  this.getCollection(collectionInfo, function (err, collection) {
    if (err) { return callback(err); }
    collection.updateMany(query, update, {w: 1}, callback);
  });
};

/**
 * Applies the given update to the document matching the given query, returning the updated
 * document.
 *
 * @param {Object} collectionInfo
 * @param {Object} query
 * @param {Object} update
 * @param {Function} callback
 */
Database.prototype.findOneAndUpdate = function (collectionInfo, query, update, callback) {
  this.getCollection(collectionInfo, function (err, collection) {
    if (err) { return callback(err); }
    collection.findOneAndUpdate(query, update, {returnOriginal: false}, function (err, r) {
      callback(err, r ? r.value : null);
    });
  });
};

/**
 * Inserts or update the document matching the query.
 *
 * @param {Object} collectionInfo
 * @param {Object} query
 * @param {Object} update
 * @param {Function} callback
 */
Database.prototype.upsertOne = function (collectionInfo, query, update, callback) {
  this.getCollection(collectionInfo, function (err, collection) {
    if (err) { return callback(err); }
    collection.updateOne(query, update, {w: 1, upsert: true}, callback);
  });
};

/**
 * Deletes the document matching the given query.
 *
 * @param {Object} collectionInfo
 * @param {Object} query
 * @param {Function} callback
 */
Database.prototype.deleteOne = function (collectionInfo, query, callback) {
  this.getCollection(collectionInfo, function (err, collection) {
    if (err) { return callback(err); }
    collection.deleteOne(query, {w: 1}, callback);
  });
};

/**
 * Deletes the document(s) matching the given query.
 *
 * @param {Object} collectionInfo
 * @param {Object} query
 * @param {Function} callback
 */
Database.prototype.deleteMany = function (collectionInfo, query, callback) {
  this.getCollection(collectionInfo, function (err, collection) {
    if (err) { return callback(err); }
    collection.deleteMany(query, {w: 1}, callback);
  });
};

/**
 * Get collection total size.
 *
 * @param {Object} collectionInfo
 * @param {Function} callback
 */
Database.prototype.totalSize = function (collectionInfo, callback) {
  this.getCollection(collectionInfo, function (err, collection) {
    if (err) { return callback(err); }
    collection.stats(function (err, stats) {
      if (err) {
        // assume collection doesn't exist
        return callback(null, 0);
      }
      callback(null, getTotalSizeFromStats(stats));
    });
  });
};

function getTotalSizeFromStats(stats) {
  // written according to http://docs.mongodb.org/manual/reference/command/collStats/
  return stats.count * 16 + // ie. record headers
      stats.size +
      stats.totalIndexSize;
}

/**
 * @param {Function} callback
 */
Database.prototype.dropCollection = function (collectionInfo, callback) {
  this.getCollection(collectionInfo, function (err, collection) {
    if (err) { return callback(err); }
    collection.drop(callback);
  });
};

/**
 * Primarily meant for tests.
 *
 * @param {Function} callback
 */
Database.prototype.dropDatabase = function (callback) {
  this.ensureConnect(function (err) {
    if (err) { return callback(err); }
    this.db.dropDatabase(callback);
  }.bind(this));
};

/**
 * Primarily meant for tests
 *
 * @param {Object} collectionInfo
 * @param {Object} options
 * @param {Function} callback
 */
Database.prototype.listIndexes = function (collectionInfo, options, callback) {
  this.getCollection(collectionInfo, function (err, collection) {
    if (err) {
      return callback(err);
    }
    collection.listIndexes(options).toArray(callback);
  });
};

// class utility functions

Database.isDuplicateError = function (err) {
  if (! err) { return false; }
  var errorCode = err.code || (err.lastErrorObject ? err.lastErrorObject.code : null);
  return errorCode === 11000 || errorCode === 11001;
};

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