/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */
const BaseStorage = require('./BaseStorage');
const converters = require('./../converters');
const util = require('util');
const _ = require('lodash');

module.exports = Profile;
/**
 * DB persistence for profile sets.
 *
 * @param {Database} database
 * @constructor
 */
function Profile (database) {
  Profile.super_.call(this, database);

  _.extend(this.converters, {
    updateToDB: [converters.getKeyValueSetUpdateFn('data')],
    convertIdToItemId: 'profileId'
  });

  this.defaultOptions = {
    sort: {}
  };
}
util.inherits(Profile, BaseStorage);

Profile.prototype.getCollectionInfo = function (userOrUserId) {
  const userId = this.getUserIdFromUserOrUserId(userOrUserId);
  return {
    name: 'profile',
    indexes: [{
      index: { profileId: 1 },
      options: { unique: true }
    }],
    useUserId: userId
  };
};
