/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const BaseStorage = require('./BaseStorage');
const converters = require('./../converters');
const util = require('util');
const treeUtils = require('utils').treeUtils;
const _ = require('lodash');

const cache = require('cache');

module.exports = Streams;

/**
 * DB persistence for event streams.
 *
 * @param {Database} database
 * @constructor
 */
function Streams (database) {
  Streams.super_.call(this, database);

  _.extend(this.converters, {
    itemDefaults: [
    ],
    itemToDB: [
      // converters.deletionToDB,
    ],
    itemsToDB: [
      treeUtils.flattenTree,
      cleanupDeletions
    ],
    updateToDB: [
      converters.stateUpdate,
      converters.getKeyValueSetUpdateFn('clientData')
    ],
    itemFromDB: [converters.deletionFromDB],
    itemsFromDB: [treeUtils.buildTree],
    convertIdToItemId: 'streamId'
  });

  this.defaultOptions = {
    sort: { name: 1 }
  };
}
util.inherits(Streams, BaseStorage);

function cleanupDeletions (streams) {
  streams.forEach(function (s) {
    if (s.deleted) {
      delete s.parentId;
    }
  });
  return streams;
}

const indexes = [
  {
    index: { streamId: 1 },
    options: { unique: true }
  },
  {
    index: { name: 1 },
    options: {}
  },
  {
    index: { name: 1, parentId: 1 },
    options: {
      unique: true,
      partialFilterExpression: {
        deleted: { $type: 'null' }
      }
    }
  },
  {
    index: { trashed: 1 },
    options: {}
  }
];

/**
 * Implementation.
 */
Streams.prototype.getCollectionInfo = function (userOrUserId) {
  const userId = this.getUserIdFromUserOrUserId(userOrUserId);
  return {
    name: 'streams',
    indexes,
    useUserId: userId
  };
};

Streams.prototype.countAll = function (user, callback) {
  this.count(user, {}, callback);
};

Streams.prototype.insertOne = function (user, stream, callback) {
  cache.unsetUserData(user.id);
  Streams.super_.prototype.insertOne.call(this, user, stream, callback);
};

Streams.prototype.updateOne = function (user, query, updatedData, callback) {
  if (typeof updatedData.parentId !== 'undefined') { // clear ALL when a stream is moved
    cache.unsetUserData(user.id);
  } else { // only stream Structure
    cache.unsetStreams(user.id, 'local');
  }
  Streams.super_.prototype.updateOne.call(this, user, query, updatedData, callback);
};

/**
 * Implementation.
 */
Streams.prototype.delete = function (userOrUserId, query, callback) {
  const userId = userOrUserId.id || userOrUserId;
  cache.unsetUserData(userId);
  const update = {
    $set: { deleted: Date.now() / 1000 },
    $unset: {
      name: 1,
      parentId: 1,
      clientData: 1,
      children: 1,
      trashed: 1,
      created: 1,
      createdBy: 1,
      modified: 1,
      modifiedBy: 1
    }
  };
  this.database.updateMany(this.getCollectionInfo(userOrUserId),
    this.applyQueryToDB(query), update, callback);
};
