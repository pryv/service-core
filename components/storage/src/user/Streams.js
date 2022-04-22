/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
var async = require('async'),
    BaseStorage = require('./BaseStorage'),
    converters = require('./../converters'),
    util = require('util'),
    toString = require('utils').toString,
    treeUtils = require('utils').treeUtils,
    _ = require('lodash');

const cache = require('cache');

module.exports = Streams;

/**
 * DB persistence for event streams.
 *
 * @param {Database} database
 * @constructor
 */
function Streams(database) {
  Streams.super_.call(this, database);

  _.extend(this.converters, {
    itemDefaults: [
      converters.createIdIfMissing,
    ],
    itemToDB: [
      converters.deletionToDB,
      converters.stateToDB
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
    sort: {name: 1}
  };
}
util.inherits(Streams, BaseStorage);

function cleanupDeletions(streams) {
  streams.forEach(function (s) {
    if (s.deleted) {
      delete s.parentId;
    }
  });
  return streams;
}

var indexes = [
  {
    index: {streamId: 1},
    options: {unique: true}
  },
 {
    index: {name: 1},
    options: {}
  },
  {
    index: { name: 1, parentId: 1 },
    options: { unique: true, partialFilterExpression: {
      deleted: { $type: 'null'}
    } }
  },
  {
    index: {trashed: 1},
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
    indexes: indexes,
    useUserId: userId
  };
};


Streams.prototype.countAll = function (user, callback) {
  this.count(user, {}, callback);
};

Streams.prototype.insertOne = function (user, stream, callback) {
  cache.unsetUserData(user.id);
  async.series([
    function checkDeletionWithSameId(stepDone) {
      if (! stream.id) { return stepDone(); }

      this.findDeletion(user, {id: stream.id}, null, function (err, deletion) {
        if (err) { return stepDone(err); }
        if (! deletion) { return stepDone(); }
        this.removeOne(user, {id: stream.id}, stepDone);
      }.bind(this));
    }.bind(this),
    function checkParent(stepDone) {
      if (! stream.parentId) { return stepDone(); }
      checkParentExists.call(this, user, stream.parentId, stepDone);
    }.bind(this)
  ], function doInsertOne(err) {
    if (err) { return callback(err); }
    Streams.super_.prototype.insertOne.call(this, user, stream, callback);
  }.bind(this));
};

Streams.prototype.updateOne = function (user, query, updatedData, callback) {
  if (typeof updatedData.parentId != 'undefined') { // clear ALL when a stream is moved
    cache.unsetUserData(user.id);
  } else { // only stream Structure
    cache.unsetStreams(user.id, 'local');
  }
  var self = this;
  if (! updatedData.parentId) {
    doUpdate();
  } else {
    checkParentExists.call(self, user, updatedData.parentId, function (err) {
      if (err) { return callback(err); }
      doUpdate();
    });
  }

  function doUpdate() {
    Streams.super_.prototype.updateOne.call(self, user, query, updatedData, callback);
  }
};

/**
 * @this {Streams}
 */
function checkParentExists(user, parentId, callback) {
  this.findOne(user, {id: parentId}, null, function (err, parent) {
    if (err) { return callback(err); }
    if (! parent) {
      return callback(new Error('Unknown parent ' + toString.id(parentId)));
    }
    callback();
  });
}

/* jshint -W024 */
/**
 * Implementation.
 */
Streams.prototype.delete = function (userOrUserId, query, callback) {
  const userId = userOrUserId.id || userOrUserId;
  cache.unsetUserData(userId);
  var update = {
    $set: {deleted: Date.now() / 1000},
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

