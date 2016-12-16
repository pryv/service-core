var _ = require('lodash'),
    converters = require('./../converters'),
    timestamp = require('unix-timestamp'),
    ApplyItemsFromDbStream = require('./../ApplyItemsFromDbStream');

module.exports = BaseStorage;
/**
 * Base class for storage modules.
 * It handles the application of data converters (if any) and querying options, as well as the
 * conversion of property `id` into `_id` as used at the database level.
 *
 * Storage modules extending it...
 *
 * - **Must** override method `getCollectionInfo()`
 * - Can set data converters (see details below)
 * - Can set default options (structure: { fields: Object, sort: Object })
 * - Can override/add other methods if needed
 *
 * **About converters**
 *
 * Converters are functions that modify objects transiting to/from the database, to e.g. allow
 * objects stored internally to differ from those served publicly. Every converter takes
 * the original object as parameter and returns the modified object.
 * Converters shouldn't need to handle cloning of the original object (to avoid side fx):
 *
 * - DB-bound (to DB) converter functions are given a shallow clone of the original object
 * - Caller-bound (from DB) converter functions directly alter the object served from the DB
 *   (which is safe).
 *
 * @param {Database} database
 * @constructor
 */
function BaseStorage(database) {
  this.database = database;
  this.converters = {
    itemDefaults: [],
    queryToDB: [],
    fieldsToDB: [],
    itemToDB: [],
    itemsToDB: [],
    updateToDB: [],
    itemFromDB: [],
    itemsFromDB: []
  };
  this.defaultOptions = { fields: {}, sort: {} };
}

/**
 * Retrieves collection information (name and indexes).
 * Must be implemented by storage modules.
 *
 * @param {Object} user The user owning the collection
 * @return {{name: string, indexes: Array}}
 */
BaseStorage.prototype.getCollectionInfo = function (user) {
  return new Error('Not implemented (user: ' + user + ')');
};

BaseStorage.prototype.countAll = function (user, callback) {
  this.database.countAll(this.getCollectionInfo(user), callback);
};

/**
 * Ignores item deletions (i.e. documents with `deleted` field).
 */
BaseStorage.prototype.count = function (user, query, callback) {
  query.deleted = null;
  this.database.count(this.getCollectionInfo(user), this.applyQueryToDB(query), callback);
};

/**
 * Ignores item deletions (i.e. documents with `deleted` field).
 * @see `findDeletions()`
 */
BaseStorage.prototype.find = function (user, query, options, callback) {
  query.deleted = null;
  this.database.find(this.getCollectionInfo(user), this.applyQueryToDB(query),
      this.applyOptionsToDB(options), function (err, dbItems) {
    if (err) { return callback(err); }
    callback(null, this.applyItemsFromDB(dbItems));
  }.bind(this));
};

/**
 * Same as find(), but returns a readable stream
 *
 * @param user
 * @param query
 * @param options
 * @param callback
 */
BaseStorage.prototype.findStreamed = function (user, query, options, callback) {
  query.deleted = null;
  this.database.findStreamed(this.getCollectionInfo(user), this.applyQueryToDB(query),
    this.applyOptionsToDB(options), function (err, dbStreamedItems) {
      if (err) { return callback(err); }
      callback(null, dbStreamedItems.pipe(new ApplyItemsFromDbStream()));
    }.bind(this));
};

BaseStorage.prototype.findDeletions = function (user, deletedSince, options, callback) {
  var query = {deleted: {$gt: timestamp.toDate(deletedSince)}};
  this.database.find(this.getCollectionInfo(user), query, this.applyOptionsToDB(options),
      function (err, dbItems) {
    if (err) { return callback(err); }
    callback(null, this.applyItemsFromDB(dbItems));
  }.bind(this));
};

BaseStorage.prototype.findDeletionsStreamed = function (user, deletedSince, options, callback) {
  var query = {deleted: {$gt: timestamp.toDate(deletedSince)}};
  this.database.findStreamed(this.getCollectionInfo(user), query, this.applyOptionsToDB(options),
    function (err, dbStreamedItems) {
      if (err) { return callback(err); }
      callback(null, dbStreamedItems.pipe(new ApplyItemsFromDbStream()));
    }.bind(this));
};

BaseStorage.prototype.findOne = function (user, query, options, callback) {
  query.deleted = null;
  this.database.findOne(this.getCollectionInfo(user), this.applyQueryToDB(query),
      this.applyOptionsToDB(options), function (err, dbItem) {
    if (err) { return callback(err); }
    callback(null, this.applyItemFromDB(dbItem));
  }.bind(this));
};

BaseStorage.prototype.findDeletion = function (user, query, options, callback) {
  query.deleted = {$exists: true};
  this.database.findOne(this.getCollectionInfo(user), this.applyQueryToDB(query),
      this.applyOptionsToDB(options), function (err, dbItem) {
    if (err) { return callback(err); }
    callback(null, this.applyItemFromDB(dbItem));
  }.bind(this));
};

BaseStorage.prototype.aggregate = function (user, query, projectExpression, groupExpression,
                                            options, callback) {
  this.database.aggregate(this.getCollectionInfo(user), this.applyQueryToDB(query),
      this.applyQueryToDB(projectExpression), this.applyQueryToDB(groupExpression),
      this.applyOptionsToDB(options), function (err, dbItems) {
    if (err) { return callback(err); }
    callback(null, this.applyItemsFromDB(dbItems));
  }.bind(this));
};

BaseStorage.prototype.insertOne = function (user, item, callback) {
  this.database.insertOne(this.getCollectionInfo(user),
      this.applyItemToDB(this.applyItemDefaults(item)), function (err) {
    if (err) { return callback(err); }
    callback(null, item);
  });
};

/**
 * Updates the single document matching the given query, returning the updated document.
 *
 * @param user
 * @param query
 * @param updatedData
 * @param callback
 */
BaseStorage.prototype.update = function (user, query, updatedData, callback) {
  this.database.findAndModify(this.getCollectionInfo(user), this.applyQueryToDB(query),
      this.applyUpdateToDB(updatedData), function (err, dbItem) {
    if (err) { return callback(err); }
    callback(null, this.applyItemFromDB(dbItem));
  }.bind(this));
};

/**
 * Updates the one or multiple document(s) matching the given query.
 *
 * @param user
 * @param query
 * @param updatedData
 * @param callback
 */
BaseStorage.prototype.updateMultiple = function (user, query, updatedData, callback) {
  this.database.update(this.getCollectionInfo(user), this.applyQueryToDB(query),
      this.applyUpdateToDB(updatedData), callback);
};

/* jshint -W024, -W098 */
/**
 * Deletes the document(s), replacing them with a deletion record (i.e. id and deletion date).
 * Returns the deletion.
 *
 * @see `remove()`, which actually removes the document from the collection
 *
 * @param user
 * @param query
 * @param callback
 */
BaseStorage.prototype.delete = function (user, query, callback) {
  return new Error('Not implemented (user: ' + user + ')');
  // this line should work when/if Mongo ever supports "replacement" update on multiple docs
  //this.database.update(this.getCollectionInfo(user), this.applyQueryToDB(query),
  //    {deleted: new Date()}, callback);
};

BaseStorage.prototype.remove = function (user, query, callback) {
  this.database.remove(this.getCollectionInfo(user), this.applyQueryToDB(query), callback);
};

BaseStorage.prototype.removeAll = function (user, callback) {
  this.database.remove(this.getCollectionInfo(user), this.applyQueryToDB({}), callback);
};

BaseStorage.prototype.dropCollection = function (user, callback) {
  this.database.dropCollection(this.getCollectionInfo(user), callback);
};

// for tests only (at the moment)

/**
 * For tests only.
 */
BaseStorage.prototype.findAll = function (user, options, callback) {
  this.database.find(this.getCollectionInfo(user), this.applyQueryToDB({}),
      this.applyOptionsToDB(options), function (err, dbItems) {
    if (err) { return callback(err); }
    callback(null, this.applyItemsFromDB(dbItems));
  }.bind(this));
};

/**
 * Inserts an array of items; each item must have a valid id and data already. For tests only.
 */
BaseStorage.prototype.insertMany = function (user, items, callback) {
  this.database.insertMany(this.getCollectionInfo(user), this.applyItemsToDB(items), callback);
};

/**
 * Gets the total size of the collection, in bytes.
 *
 * @param {Object} user
 * @param {Function} callback
 */
BaseStorage.prototype.getTotalSize = function (user, callback) {
  this.database.totalSize(this.getCollectionInfo(user), callback);
};

// converters application functions

/**
 * @api private
 */
BaseStorage.prototype.applyItemDefaults = function (item) {
  // no cloning! we do want to alter the original object
  return applyConverters(item, this.converters.itemDefaults);
};

/**
 * @api private
 */
BaseStorage.prototype.applyQueryToDB = function (query) {
  return applyConvertersToDB(_.clone(query), this.converters.queryToDB);
};

/**
 * @api private
 */
BaseStorage.prototype.applyOptionsToDB = function (options) {
  var dbOptions = _.defaults(options ? _.clone(options) : {}, this.defaultOptions);
  dbOptions.fields = applyConvertersToDB(dbOptions.fields, this.converters.fieldsToDB);
  dbOptions.sort = applyConvertersToDB(dbOptions.sort, this.converters.fieldsToDB);
  return dbOptions;
};

/**
 * @api private
 */
BaseStorage.prototype.applyItemToDB = function (item) {
  return applyConvertersToDB(_.clone(item), this.converters.itemToDB);
};

/**
 * @api private
 */
BaseStorage.prototype.applyItemsToDB = function (items) {
  return applyConvertersToDB(items.slice(), this.converters.itemsToDB)
      .map(this.applyItemToDB.bind(this));
};

/**
 * @api private
 */
BaseStorage.prototype.applyUpdateToDB = function (updatedData) {
  var dbUpdate = applyConvertersToDB({ $set: _.clone(updatedData), $unset: {} },
      this.converters.updateToDB);
  if (_.isEmpty(dbUpdate.$set)) { delete dbUpdate.$set; }
  if (_.isEmpty(dbUpdate.$unset)) { delete dbUpdate.$unset; }
  return dbUpdate;
};

/**
 * @api private
 */
BaseStorage.prototype.applyItemFromDB = function (dbItem) {
  return applyConvertersFromDB(dbItem, this.converters.itemFromDB);
};

/**
 * @api private
 */
BaseStorage.prototype.applyItemsFromDB = function (dbItems) {
  return applyConvertersFromDB(dbItems.map(this.applyItemFromDB.bind(this)),
      this.converters.itemsFromDB);
};

var idToDB = converters.getRenamePropertyFn('id', '_id'),
    idFromDB = converters.getRenamePropertyFn('_id', 'id');

function applyConvertersToDB(object, converterFns) {
  return idToDB(applyConverters(object, converterFns));
}

function applyConvertersFromDB(object, converterFns) {
  return applyConverters(idFromDB(object), converterFns);
}

function applyConverters(object, converterFns) {
  converterFns.forEach(function (fn) { object = fn(object); });
  return object;
}
