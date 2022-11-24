/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const BaseStorage = require('./BaseStorage');
const converters = require('./../converters');
const generateId = require('cuid');
const util = require('util');
const _ = require('lodash');
const integrity = require('business/src/integrity');
const { getLogger } = require('@pryv/boiler');
const logger = getLogger('storage:accesses');

module.exports = Accesses;

/**
 * DB persistence for accesses.
 *
 * @param {Database} database
 * @constructor
 */
function Accesses (database) {
  Accesses.super_.call(this, database);

  _.extend(this.converters, {
    itemDefaults: [
      converters.createIdIfMissing,
      createTokenIfMissing
    ],
    itemToDB: [converters.deletionToDB, addIntegrity],
    itemsToDB: [
      function (items) {
        if (items == null) return null;
        const res = items.map(a => addIntegrity(converters.deletionToDB(a)));
        return res;
      }
    ],
    itemFromDB: [converters.deletionFromDB],
    queryToDB: [converters.idInOrClause]
  });

  this.defaultOptions = {
    sort: { name: 1 }
  };
}
util.inherits(Accesses, BaseStorage);

function createTokenIfMissing (access) {
  access.token = access.token || generateId();
  return access;
}

function addIntegrity (accessData) {
  if (!integrity.accesses.isActive) return accessData;
  integrity.accesses.set(accessData);
  return accessData;
}

const indexes = [
  {
    index: { token: 1 },
    options: {
      unique: true,
      partialFilterExpression: { deleted: { $type: 'null' } }
    }
  },
  {
    index: { integrityBatchCode: 1 },
    options: {}
  },
  {
    index: { name: 1, type: 1, deviceName: 1 },
    options: {
      unique: true,
      partialFilterExpression: { deleted: { $type: 'null' } }
    }
  }
];

Accesses.prototype.findDeletions = function (
  userOrUserId,
  query,
  options,
  callback
) {
  query = query || {};
  query.deleted = { $type: 'number' };

  this.database.find(
    this.getCollectionInfo(userOrUserId),
    query,
    this.applyOptionsToDB(options),
    function (err, dbItems) {
      if (err) {
        return callback(err);
      }
      callback(null, this.applyItemsFromDB(dbItems));
    }.bind(this)
  );
};

/**
 * Implementation.
 */
Accesses.prototype.getCollectionInfo = function (userOrUserId) {
  const userId = this.getUserIdFromUserOrUserId(userOrUserId);
  return {
    name: 'accesses',
    indexes,
    useUserId: userId
  };
};

/* jshint -W024 */
/**
 * Implementation.
 */
Accesses.prototype.delete = function (userOrUserId, query, callback) {
  const update = {
    $set: { deleted: Date.now() / 1000 }
  };
  const finalCallBack = getResetIntegrity(this, userOrUserId, update, callback);
  this.database.updateMany(this.getCollectionInfo(userOrUserId),
    this.applyQueryToDB(query), update, finalCallBack);
};

/**
 * Exposed for convenience.
 *
 * @returns {String}
 */
Accesses.prototype.generateToken = function () {
  return generateId();
};

Accesses.prototype.updateOne = function (userOrUserId, query, update, callback) {
  if (update.modified == null || !integrity.accesses.isActive) { // update only if "modified" is set .. to avoid all "calls" and "lastused" updated
    Accesses.super_.prototype.findOneAndUpdate.call(this, userOrUserId, query, update, callback);
    return;
  }

  // unset eventually existing integrity field. Unless integrity is in set request
  if (update.integrity == null && update.$set?.integrity == null) {
    if (!update.$unset) update.$unset = {};
    update.$unset.integrity = 1;
  }

  const that = this;
  const cb = function callbackIntegrity (err, accessData) {
    if (err || (accessData?.id == null)) return callback(err, accessData);

    const integrityCheck = accessData.integrity;
    try {
      integrity.accesses.set(accessData, true);
    } catch (errIntegrity) {
      return callback(errIntegrity, accessData);
    }
    // only update if there is a mismatch of integrity
    if (integrityCheck !== accessData.integrity) {
      // could be optimized by using "updateOne" instead of findOne and update
      return Accesses.super_.prototype.findOneAndUpdate.call(that, userOrUserId, { _id: accessData.id }, { integrity: accessData.integrity }, callback);
    }
    callback(err, accessData);
  };
  Accesses.super_.prototype.findOneAndUpdate.call(this, userOrUserId, query, update, cb);
};

/**
 * Inserts an array of accesses; each item must have a valid id and data already. For tests only.
 */
Accesses.prototype.insertMany = function (userOrUserId, accesses, callback) {
  const accessesToCreate = accesses.map((a) => {
    if (a.deleted === undefined) return _.assign({ deleted: null }, a);
    return a;
  });
  this.database.insertMany(
    this.getCollectionInfo(userOrUserId),
    this.applyItemsToDB(accessesToCreate),
    callback
  );
};

/**
 * - Allways unset 'integrity' of updated events by modifiying update query
 * - If integrity is active for event returns a callBack to be exectued at after the update
 * @param {Accesses} accessesStore
 * @param {User | userId} userOrUserId
 * @param {Object} upddate -- the update query to be modified
 * @param {*} callback
 * @returns either the original callback or a process to reset events' integrity
 */
function getResetIntegrity (accessesStore, userOrUserId, update, callback) {
  // anyway remove any integrity that might have existed
  if (!update.$unset) update.$unset = {};
  update.$unset.integrity = 1;

  // not active return the normal callback
  if (!integrity.accesses.isActive) return callback;

  // add a random "code" to the original update find out which events have been modified
  const integrityBatchCode = Math.random();
  if (!update.$set) update.$set = {};
  update.$set.integrityBatchCode = integrityBatchCode;

  // return a callback that will be executed after the update
  return function (err, res) {
    if (err) return callback(err);
    const initialModifiedCount = res.modifiedCount;

    // will be called for each updated item
    // we should remove the "integrityBatchCode" that helped finding them out
    // and add the integrity value
    function updateIfNeeded (access) {
      delete access.integrityBatchCode; // remove integrity batch code for computation
      const previousIntegrity = access.integrity;
      integrity.accesses.set(access, true);
      if (previousIntegrity === access.integrity) return null;
      return {
        $unset: { integrityBatchCode: 1 },
        $set: { integrity: access.integrity }
      };
    }

    function doneCallBack (err2, res2) {
      if (err2) return callback(err2);
      if (res2.count !== initialModifiedCount) { // updated documents counts does not match
        logger.error('Issue when adding integrity to updated events for ' + JSON.stringify(userOrUserId) + ' counts does not match');
        // eventually throw an error here.. But this will not help the API client ..
        // to be discussed !
      }
      return callback(err2, res2);
    }

    accessesStore.findAndUpdateIfNeeded(userOrUserId, { integrityBatchCode }, {}, updateIfNeeded, doneCallBack);
  };
}
