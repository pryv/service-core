/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Common converter helper functions for storage modules.
 */

const generateId = require('cuid');
const timestamp = require('unix-timestamp');
const _ = require('lodash');

exports.createIdIfMissing = function (item) {
  item.id = item.id || generateId();
  return item;
};

exports.getRenamePropertyFn = function (oldName, newName) {
  return function (item) {
    if (! item || ! item.hasOwnProperty(oldName)) {
      return item;
    }

    item[newName] = item[oldName];
    delete item[oldName];

    return item;
  };
};

/**
 * Converts the item's state to DB storage.
 * In our exposed API, items supporting state can carry a 'trashed' boolean field (true or false;
 * considered false if missing);
 * in the database, though, for optimization we only retain the 'trashed' field when it is true.
 */
exports.stateToDB = function (item) {
  if (item.trashed !== true) {
    delete item.trashed;
  }
  return item;
};

exports.stateUpdate = function (update) {
  if (update.$set.hasOwnProperty('trashed') && ! update.$set.trashed) {
    update.$unset.trashed = 1;
    delete update.$set.trashed;
  }
  return update;
};

exports.getKeyValueSetUpdateFn = function (propertyName) {
  propertyName = propertyName || 'clientData';
  return function (update) {
    var keyValueSet = update.$set[propertyName];
    if (keyValueSet) {
      Object.keys(keyValueSet).forEach(function (key) {
        if (keyValueSet[key] !== null) {
          update.$set[propertyName + '.' + key] = keyValueSet[key];
        } else {
          update.$unset[propertyName + '.' + key] = 1;
        }
      });
      delete update.$set[propertyName];
    }
    return update;
  };
};


exports.deletionToDB = function (item) {
  if (item.deleted != null) {
    item.deleted = timestamp.toDate(item.deleted);
  } else {
    item.deleted = null;
  }
  return item;
};

exports.deletionFromDB = function (dbItem) {
  if (dbItem == null) { return dbItem; }

  if (dbItem.deleted == null) {
    delete dbItem.deleted;
  }

  if (dbItem.deleted != null) {
    dbItem.deleted = timestamp.fromDate(dbItem.deleted);
  }
  return dbItem;
};

/**
 * Inside $or clauses, converts "id" to "_id"
 * @param {*} query 
 */
exports.idInOrClause = function (query) {
  if (query == null || query['$or'] == null) return query;
  const convertedOrClause = query['$or'].map(field => {
    if (field.id != null) {
      return { _id: field.id };
    }
    return field;
  });
  query['$or'] = convertedOrClause;
  return query;
}


exports.removeFieldsEnforceUniqueness = function (dbItem) {
  if (dbItem == null) { return dbItem; }

  dbItem = Object.keys(dbItem)
    .filter(key => ! /__unique/.test(key))
    .reduce((obj, key) => {
      obj[key] = dbItem[key];
      return obj;
    }, {});

  return dbItem;
};