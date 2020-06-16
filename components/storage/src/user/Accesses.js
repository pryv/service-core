const generateId = require('cuid');
const util = require('util');
const _ = require('lodash');
const converters = require('../converters');
const BaseStorage = require('./BaseStorage');

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
      createTokenIfMissing,
    ],
    itemToDB: [converters.deletionToDB],
    itemFromDB: [converters.deletionFromDB],
  });

  this.defaultOptions = {
    sort: { name: 1 },
  };
}
util.inherits(Accesses, BaseStorage);

function createTokenIfMissing(access) {
  access.token = access.token || generateId();
  return access;
}

const indexes = [
  {
    index: { token: 1 },
    options: {
      unique: true,
      partialFilterExpression: { deleted: { $type: 'null' } },
    },
  },
  {
    index: { name: 1, type: 1, deviceName: 1 },
    options: {
      unique: true,
      partialFilterExpression: { deleted: { $type: 'null' } },
    },
  },
];

Accesses.prototype.findDeletions = function (
  user,
  query,
  options,
  callback,
) {
  query = query || {};
  query.deleted = { $type: 'date' };

  this.database.find(
    this.getCollectionInfo(user),
    query,
    this.applyOptionsToDB(options),
    (err, dbItems) => {
      if (err) {
        return callback(err);
      }
      callback(null, this.applyItemsFromDB(dbItems));
    },
  );
};

/**
 * Implementation.
 */
Accesses.prototype.getCollectionInfo = function (user) {
  return {
    name: 'accesses',
    indexes,
    useUserId: user.id,
  };
};

/* jshint -W024 */
/**
 * Implementation.
 */
Accesses.prototype.delete = function (user, query, callback) {
  const update = {
    $set: { deleted: new Date() },
  };
  this.database.updateMany(this.getCollectionInfo(user),
    this.applyQueryToDB(query), update, callback);
};

/**
 * Exposed for convenience.
 *
 * @returns {String}
 */
Accesses.prototype.generateToken = function () {
  return generateId();
};

/**
 * Override base method to set deleted:null
 *
 * @param {*} user
 * @param {*} item
 * @param {*} callback
 */
Accesses.prototype.insertOne = function (user, access, callback) {
  const accessToCreate = _.clone(access);
  if (accessToCreate.deleted === undefined) accessToCreate.deleted = null;
  this.database.insertOne(
    this.getCollectionInfo(user),
    this.applyItemToDB(this.applyItemDefaults(accessToCreate)),
    (err) => {
      if (err) {
        return callback(err);
      }
      callback(null, _.omit(accessToCreate, 'deleted'));
    },
  );
};

/**
 * Inserts an array of accesses; each item must have a valid id and data already. For tests only.
 */
Accesses.prototype.insertMany = function (user, accesses, callback) {
  const accessesToCreate = accesses.map((a) => {
    if (a.deleted === undefined) return _.assign({ deleted: null }, a);
    return a;
  });
  this.database.insertMany(
    this.getCollectionInfo(user),
    this.applyItemsToDB(accessesToCreate),
    callback,
  );
};
