var async = require('async'),
    BaseStorage = require('./user/BaseStorage'),
    converters = require('./converters'),
    encryption = require('components/utils').encryption,
    util = require('util'),
    _ = require('lodash');

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
    itemDefaults: [converters.createIdIfMissing]
  });

  this.defaultOptions = {
    sort: {username: 1}
  };
}
util.inherits(Users, BaseStorage);

var indexes = [
  {
    index: {username: 1},
    options: {unique: true}
  },
  {
    index: {email: 1},
    options: {unique: true}
  }
];

/**
 * Implementation.
 */
Users.prototype.getCollectionInfo = function () {
  return {
    name: 'users',
    indexes: indexes
  };
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
 * Inserts a single item, encrypting `password` into `passwordHash`.
 *
 * @param {Function} callback ({Error}, {String})
 */
Users.prototype.insertOne = function (user, callback) {
  var self = this;
  encryptPassword(user, function (err, dbUser) {
    if (err) { return callback(err); }
    Users.super_.prototype.insertOne.call(self, null, dbUser, callback);
  });
};

/**
 * Override.
 */
Users.prototype.updateOne = function (query, updatedData, callback) {
  Users.super_.prototype.updateOne.call(this, null, query, updatedData, callback);
};

/**
 * Override.
 * Inserts an array of items, encrypting `password` into `passwordHash`.
 * Each item must have a valid id already.
 */
Users.prototype.insertMany = function (users, callback) {
  var self = this;
  async.map(users, encryptPassword, function (err, dbUsers) {
    if (err) { return callback(err); }
    Users.super_.prototype.insertMany.call(self, null, dbUsers, callback);
  });
};



/**
 * @param {Function} callback (error, dbUser) `dbUser` is a clone of the original user.
 */
function encryptPassword(user, callback) {
  const dbUser = _.clone(user);
  if (! dbUser.password && dbUser.passwordHash) {
    // OK: assume it's been hashed in registration-server already
    callback(null, dbUser);
  } else {
    encryption.hash(dbUser.password, function (err, hash) {
      if (err != null) return callback(err);

      dbUser.passwordHash = hash;
      delete dbUser.password;

      callback(null, dbUser);
    });
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
 * For tests only.
 */
Users.prototype.removeAll = function (callback) {
  Users.super_.prototype.removeAll.call(this, null, callback);
};


// ------------------ pool tools -------------//
// ----- to be moved out of Storage ----------//
// -------------------------------------------//

const cuid = require('cuid');


const POOL_USERNAME = 'pool@';
const POOL_REGEX = new Regex( '^'  + POOL_USERNAME);


Users.prototype.insertOnePool = function ( callback) {
  var self = this;
  preparePoolUser(user, function (err, dbUser) {
    if (err) { return callback(err); }
    self.insertOne.call(dbUser, callback);
  });
};

/**
 * @param {Function} callback (error, dbUser) `dbUser` is a clone of the original user.
 */
function preparePoolUser(user, callback) {
  const dbUser = _.clone(user);
  const randomString = cuid();

  delete dbUser.password;
  dbUser.username = POOL_USERNAME + randomString;
  dbUser.passwordHash = 'dummy';
  dbUser.language = 'en';
  dbUser.email = dbUser.username + '.bogus';

  callback(null, dbUser);
}

Users.prototype.countPool = function (callback) {
  const query = {username: { $regex : POOL_REGEX}};
  Users.super_.prototype.count.call(this, null, query, callback);
}

Users.prototype.findOneFromPool = function (callback) {
  const query = {username: { $regex : POOL_REGEX}};
  Users.super_.prototype.count.findOne(this, null, query, callback);
}


Users.prototype.insertOneOrUsePool(user, callback) {
  var self = this;
  encryptPassword(user, function (err, dbUser) {
    if (err) { return callback(err); }

    self.findOneFromPool(function (err, result) { 
      if (err) { return callback(err); }
      if (result == null) {
        Users.super_.prototype.insertOne.call(self, null, dbUser, callback);
      } else {
        Users.super_.prototype.updateOne.call(self, null, {username: result.username}, dbUser, callback);
      }
    });
  });
}




