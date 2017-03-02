/**
 * Tiny store for password reset requests.
 */
module.exports = PasswordResetRequests;

var generateId = require('cuid'),
    _ = require('lodash');

var collectionInfo = {
  name: 'passwordResets',
  indexes: [
    // set TTL index for auto cleanup of expired requests
    {
      index: {expires: 1},
      options: {expireAfterSeconds: 0}
    }
  ]
};

/**
 * Creates a new instance with the given database and options.
 *
 * @param {Object} database
 * @param {Object} options Possible options: `maxAge` (in milliseconds)
 * @constructor
 */
function PasswordResetRequests(database, options) {
  this.database = database;
  this.options = _.extend({
    maxAge: 1000 * 60 * 60 // one hour
  }, options);
}

/**
 * Fetches the specified reset request's data (or null if the request doesn't exist or has expired).
 *
 * @param {String} id
 * @param {Function} callback Args: err, data
 */
PasswordResetRequests.prototype.get = function (id, callback) {
  this.database.findOne(collectionInfo, {_id: id}, null, function (err, resetReq) {
    if (err) {
      return callback(err);
    }

    if (! resetReq) {
      return callback(null, null);
    }

    if (! resetReq.expires || new Date() < resetReq.expires) {
      callback(null, resetReq.data);
    } else {
      this.destroy(id, callback);
    }
  }.bind(this));
};

/**
 * Creates a new reset request with the given data.
 *
 * @param {Object} data
 * @param {Function} callback Args: err, id
 */
PasswordResetRequests.prototype.generate = function (data, callback) {
  var resetReq = {
    _id: generateId(),
    data: typeof data === 'object' ? data : {},
    expires: this.getNewExpirationDate()
  };
  this.database.insertOne(collectionInfo, resetReq, function (err) {
    if (err) { return callback(err); }
    callback(null, resetReq._id);
  });
};

/**
 * Deletes the specified reset request.
 *
 * @param {String} id
 * @param {Function} callback
 */
PasswordResetRequests.prototype.destroy = function (id, callback) {
  this.database.deleteOne(collectionInfo, {_id: id}, callback);
};

/**
 * Destroys all reset requests.
 *
 * @param {Function} callback
 */
PasswordResetRequests.prototype.clearAll = function (callback) {
  this.database.deleteMany(collectionInfo, {}, callback);
};

PasswordResetRequests.prototype.getNewExpirationDate = function () {
  return new Date((new Date()).getTime() + this.options.maxAge);
};
