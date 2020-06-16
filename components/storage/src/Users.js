const async = require('async');
const { encryption } = require('components/utils');
const util = require('util');
const _ = require('lodash');
const converters = require('./converters');
const BaseStorage = require('./user/BaseStorage');

module.exports = Users;
/**
 * DB persistence for users.
 *
 * @param {Database} database
 * @constructor
 */
function Users(database) {
  Users.super_.call(this, database);

  _.extend(this.converters, {
    itemDefaults: [converters.createIdIfMissing],
  });

  this.defaultOptions = {
    sort: { username: 1 },
  };
}
util.inherits(Users, BaseStorage);

const indexes = [
  {
    index: { username: 1 },
    options: { unique: true },
  },
  {
    index: { email: 1 },
    options: { unique: true },
  },
];

/**
 * Implementation.
 */
Users.prototype.getCollectionInfo = function () {
  return {
    name: 'users',
    indexes,
  };
};

/**
 * Override.
 */
Users.prototype.count = function (query, callback) {
  Users.super_.prototype.count.call(this, null, query, callback);
};

/**
 * Override.
 */
Users.prototype.countAll = function (callback) {
  Users.super_.prototype.countAll.call(this, null, callback);
};

/**
 * Override.
 */
Users.prototype.findOne = function (query, options, callback) {
  Users.super_.prototype.findOne.call(this, null, query, options, callback);
};

/**
 * Override.
 */
Users.prototype.findOneAndUpdate = function (query, updatedData, callback) {
  const self = this;
  encryptPassword(updatedData, (err, update) => {
    if (err) { return callback(err); }
    Users.super_.prototype.findOneAndUpdate.call(self, null, query, update, callback);
  });
};

/**
 * Override.
 * Inserts a single item, encrypting `password` into `passwordHash`.
 *
 * @param {Function} callback ({Error}, {String})
 */
Users.prototype.insertOne = function (user, callback) {
  const self = this;
  encryptPassword(user, (err, dbUser) => {
    if (err) { return callback(err); }
    Users.super_.prototype.insertOne.call(self, null, dbUser, callback);
  });
};

/**
 * Override.
 */
Users.prototype.updateOne = function (query, updatedData, callback) {
  const self = this;
  encryptPassword(updatedData, (err, update) => {
    if (err) { return callback(err); }
    Users.super_.prototype.updateOne.call(self, null, query, update, callback);
  });
};

/**
 * Override.
 * Inserts an array of items, encrypting `password` into `passwordHash`.
 * Each item must have a valid id already.
 */
Users.prototype.insertMany = function (users, callback) {
  const self = this;
  async.map(users, encryptPassword, (err, dbUsers) => {
    if (err) { return callback(err); }
    Users.super_.prototype.insertMany.call(self, null, dbUsers, callback);
  });
};

/**
 * @param {Function} callback (error, dbUser) `dbUser` is a clone of the original user.
 */
function encryptPassword(user, callback) {
  const dbUser = _.clone(user);
  if (dbUser.password != null) {
    encryption.hash(dbUser.password, (err, hash) => {
      if (err != null) return callback(err);

      dbUser.passwordHash = hash;
      delete dbUser.password;

      callback(null, dbUser);
    });
  } else {
    // Nothing to encrypt
    callback(null, dbUser);
  }
}

/**
 * Override.
 */
Users.prototype.remove = function (query, callback) {
  Users.super_.prototype.removeMany.call(this, null, query, callback);
};

/**
 * Override.
 */
Users.prototype.findAll = function (options, callback) {
  Users.super_.prototype.findAll.call(this, null, options, callback);
};

/**
 * Override.
 */
Users.prototype.find = function (query, options, callback) {
  Users.super_.prototype.find.call(this, null, query, options, callback);
};

/**
 * Override.
 * For tests only.
 */
Users.prototype.removeAll = function (callback) {
  Users.super_.prototype.removeAll.call(this, null, callback);
};
