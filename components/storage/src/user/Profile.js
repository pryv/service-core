var BaseStorage = require('./BaseStorage'),
    converters = require('./../converters'),
    util = require('util'),
    _ = require('lodash');

module.exports = Profile;
/**
 * DB persistence for profile sets.
 *
 * @param {Database} database
 * @constructor
 */
function Profile(database) {
  Profile.super_.call(this, database);

  _.extend(this.converters, {
    updateToDB: [converters.getKeyValueSetUpdateFn('data')]
  });

  this.defaultOptions = {
    sort: {}
  };
}
util.inherits(Profile, BaseStorage);

Profile.prototype.getCollectionInfo = function (user) {
  return {
    name: user.id + '.profile',
    indexes: []
  };
};

Profile.prototype.initCollection = function (user, callback) {
  const self = this;
  Profile.super_.prototype.getCollection.call(self, self.getCollectionInfo(user), callback);
};
