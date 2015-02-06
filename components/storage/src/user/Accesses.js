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
    fields: {},
    sort: {name: 1}
  };
}
util.inherits(Accesses, BaseStorage);

function createTokenIfMissing(access) {
  access.token = access.token || generateId();
  return access;
}

var indexes = [
  {
    index: {token: 1},
    options: { unique: true, sparse: true }
  },
  {
    index: { name: 1, type: 1, deviceName: 1 },
    options: { unique: true, sparse: true }
  },
  {
    index: {deleted: 1},
    options: {
      // cleanup deletions after 3 years (cf. HIPAA rules)
      expireAfterSeconds: 3600 * 24 * 365 * 3
    }
  }
];

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
    $set: {deleted: new Date()},
    $rename: {
      // rename fields in unique indexes to avoid collisions
      token: '_token',
      type: '_type',
      name: '_name',
      deviceName: '_deviceName'
    }
  };
  this.database.update(this.getCollectionInfo(user), this.applyQueryToDB(query), update, callback);
};

/**
 * Exposed for convenience.
 *
 * @returns {String}
 */
Accesses.prototype.generateToken = function () {
  return generateId();
};
