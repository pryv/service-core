var BaseStorage = require('./BaseStorage'),
    converters = require('./../converters'),
    generateId = require('cuid'),
    util = require('util'),
    _ = require('lodash');

module.exports = Accesses;
/**
 * DB persistence for accesses.
 *
 * @param {Database} database
 * @constructor
 */
function Accesses(database) {
  Accesses.super_.call(this, database);

  _.extend(this.converters, {
    itemDefaults: [
      converters.createIdIfMissing,
      createTokenIfMissing
    ],
    itemToDB: [converters.deletionToDB],
    itemFromDB: [converters.deletionFromDB]
  });

  this.defaultOptions = {
    sort: {name: 1}
  };
}
util.inherits(Accesses, BaseStorage);

function createTokenIfMissing(access) {
  access.token = access.token || generateId();
  return access;
}

var indexes = [
  {
    index: {token: 1},
    options: { 
      unique: true,
      partialFilterExpression: { deleted: { $type: 'null' } }
    }
  },
  {
    index: { name: 1, type: 1, deviceName: 1 },
    options: { 
      unique: true,
      partialFilterExpression: { deleted: { $type: 'null' } }
    }
  }
];

Accesses.prototype.findDeletions = function (
  user,
  options,
  callback
) {
  var query = { deleted: { $exists: true } };
  this.database.find(
    this.getCollectionInfo(user),
    query,
    this.applyOptionsToDB(options),
    function (err, dbItems) {
      if (err) {
        return callback(err);
      }
      callback(null, this.applyItemsFromDB(dbItems));
    }.bind(this)
  );
};

/**
 * Implementation.
 */
Accesses.prototype.getCollectionInfo = function (user) {
  return {
    name: user.id + '.accesses',
    indexes: indexes
  };
};

/* jshint -W024 */
/**
 * Implementation.
 */
Accesses.prototype.delete = function (user, query, callback) {
  var update = {
    $set: {deleted: new Date()}
  };
  this.database.updateMany(this.getCollectionInfo(user), this.applyQueryToDB(query), update,
      callback);
};

/**
 * Exposed for convenience.
 *
 * @returns {String}
 */
Accesses.prototype.generateToken = function () {
  return generateId();
};
