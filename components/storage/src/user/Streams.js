const async = require('async');
const util = require('util');
const { toString } = require('components/utils');
const { treeUtils } = require('components/utils');
const _ = require('lodash');
const converters = require('../converters');
const BaseStorage = require('./BaseStorage');

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
      converters.stateToDB,
    ],
    itemsToDB: [
      treeUtils.flattenTree,
      cleanupDeletions,
    ],
    updateToDB: [
      converters.stateUpdate,
      converters.getKeyValueSetUpdateFn('clientData'),
    ],
    itemFromDB: [converters.deletionFromDB],
    itemsFromDB: [treeUtils.buildTree],
    convertIdToItemId: 'streamId',
  });

  this.defaultOptions = {
    sort: { name: 1 },
  };
}
util.inherits(Streams, BaseStorage);

function cleanupDeletions(streams) {
  streams.forEach((s) => {
    if (s.deleted) {
      delete s.parentId;
    }
  });
  return streams;
}

const indexes = [
  {
    index: { streamId: 1 },
    options: { unique: true },
  },
  {
    index: { name: 1 },
    options: {},
  },
  {
    index: { name: 1, parentId: 1 },
    options: {
      unique: true,
      partialFilterExpression: {
        deleted: { $type: 'null' },
      },
    },
  },
  {
    index: { trashed: 1 },
    options: {},
  },
];

/**
 * Implementation.
 */
Streams.prototype.getCollectionInfo = function (user) {
  return {
    name: 'streams',
    indexes,
    useUserId: user.id,
  };
};

Streams.prototype.countAll = function (user, callback) {
  this.count(user, {}, callback);
};

Streams.prototype.insertOne = function (user, stream, callback) {
  async.series([
    function checkDeletionWithSameId(stepDone) {
      if (!stream.id) { return stepDone(); }

      this.findDeletion(user, { id: stream.id }, null, (err, deletion) => {
        if (err) { return stepDone(err); }
        if (!deletion) { return stepDone(); }
        this.removeOne(user, { id: stream.id }, stepDone);
      });
    }.bind(this),
    function checkParent(stepDone) {
      if (!stream.parentId) { return stepDone(); }
      checkParentExists.call(this, user, stream.parentId, stepDone);
    }.bind(this),
  ], (err) => {
    if (err) { return callback(err); }
    Streams.super_.prototype.insertOne.call(this, user, stream, callback);
  });
};

Streams.prototype.updateOne = function (user, query, updatedData, callback) {
  const self = this;
  if (!updatedData.parentId) {
    doUpdate();
  } else {
    checkParentExists.call(self, user, updatedData.parentId, (err) => {
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
  this.findOne(user, { id: parentId }, null, (err, parent) => {
    if (err) { return callback(err); }
    if (!parent) {
      return callback(new Error(`Unknown parent ${toString.id(parentId)}`));
    }
    callback();
  });
}

/* jshint -W024 */
/**
 * Implementation.
 */
Streams.prototype.delete = function (user, query, callback) {
  const update = {
    $set: { deleted: new Date() },
    $unset: {
      name: 1,
      parentId: 1,
      clientData: 1,
      children: 1,
      trashed: 1,
      created: 1,
      createdBy: 1,
      modified: 1,
      modifiedBy: 1,
    },
  };
  this.database.updateMany(this.getCollectionInfo(user),
    this.applyQueryToDB(query), update, callback);
};
