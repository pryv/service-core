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
