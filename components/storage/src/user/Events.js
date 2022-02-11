/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const BaseStorage = require('./BaseStorage');
const converters = require('./../converters');
const util = require('util');
const _ = require('lodash');

module.exports = Events;
/**
 * DB persistence for events.
 *
 * Note: period events are stored with both `duration` (exposed publicly) and `endTime`.
 * `endTime` is a computed (`time` + `duration`), storage-only field absent from retrieved events.
 * Callers can (and should) make use of `endTime` to simplify and optimize their "find" queries.
 *
 * @param {Database} database
 * @constructor
 */
function Events (database) {
  Events.super_.call(this, database);
  
  _.extend(this.converters, {
    itemDefaults: [],
    itemToDB: [],
    itemsToDB: [],
    updateToDB: [],
    itemFromDB: [],
    itemsFromDB: [],
  });

  this.defaultOptions = {};
}
util.inherits(Events, BaseStorage);

function getDbIndexes () {
  // TODO: review indexes against 1) real usage and 2) how Mongo actually uses them
  const indexes = [
    {
      index: { time: 1 },
      options: {},
    },
    {
      index: { streamIds: 1 },
      options: {},
    },
    // no index by content until we have more actual usage feedback
    {
      index: { trashed: 1 },
      options: {},
    },
    {
      index: { modified: 1 },
      options: {},
    },
    {
      index: { endTime: 1 },
      options: { partialFilterExpression: { endTime: { $exists: true } } },
    }
  ];
  return indexes;
}



/**
 * Updates the one or multiple document(s) matching the given query.
 *
 * @param user
 * @param query
 * @param update
 * @param callback
*/
Events.prototype.updateMany = function (userOrUserId, query, update, callback) {
  throw new Error('Deprecated, use mall.events.update*()');
  Events.super_.prototype.updateMany.call(this, userOrUserId, query, update, finalCallBack);
};

/**
 * Implementation.
 */
Events.prototype.getCollectionInfo = function (userOrUserId) {
  const userId = this.getUserIdFromUserOrUserId(userOrUserId);
  return {
    name: 'events',
    indexes: getDbIndexes(),
    useUserId: userId
  };
};

Events.prototype.getCollectionInfoWithoutUserId = function () {
  return {
    name: 'events',
    indexes: getDbIndexes()
  };
};

/**
 * Implementation
 */
Events.prototype.findStreamed = function (userOrUserId, query, options, callback) {
  throw new Error('Deprecated, use mall');
};

Events.prototype.countAll = function (user, callback) {
  throw new Error('Deprecated, use mall');
};


/* jshint -W024 */
/**
 * Implementation.
 */
Events.prototype.delete = function (userOrUserId, query, deletionMode, callback) {
  throw new Error('Deprecated, use mall.events.delete()');
};

/**
 * Do not use!
 * @see mall.events.get()
 */
 Events.prototype.find = function (userOrUserId, query, options, callback) {
  throw new Error('Deprecated, use mall.events.get()');
  //Events.super_.prototype.find.call(this, userOrUserId, query, options, callback);
};

/**
 * Do not use!
 * @see mall.events.getOne()
 */
 Events.prototype.findOne = function (userOrUserId, query, options, callback) {
    throw new Error('Deprecated, use mall.events.getOne() or .get()');
 };

 /**
 * Reserved for LocalStoreUser use only mall.events.create();
 * @see mall.events.create()
 */
  Events.prototype.insertMany = function (userOrUserId, items, callback, options) {
    throw new Error('Deprecated, use mall.events.create()');
  };

