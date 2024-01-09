/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
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
