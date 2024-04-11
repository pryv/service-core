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

module.exports = FollowedSlices;
/**
 * DB persistence for followed slices.
 *
 * @param {Database} database
 * @constructor
 */
function FollowedSlices (database) {
  FollowedSlices.super_.call(this, database);

  _.extend(this.converters, {
    itemDefaults: [converters.createIdIfMissing]
  });

  this.defaultOptions = {
    sort: { name: 1 }
  };
}
util.inherits(FollowedSlices, BaseStorage);

const indexes = [
  {
    index: { name: 1 },
    options: { unique: true }
  },
  {
    index: { url: 1, accessToken: 1 },
    options: { unique: true }
  }
];

/**
 * Implementation.
 */
FollowedSlices.prototype.getCollectionInfo = function (userOrUserId) {
  const userId = this.getUserIdFromUserOrUserId(userOrUserId);
  return {
    name: 'followedSlices',
    indexes,
    useUserId: userId
  };
};
