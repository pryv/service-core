/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Utilities for storage queries.
 */

/**
 * Applies the given state parameter to the given query object.
 *
 * @param {Object} query
 * @param {String} state "default", "trashed" or "all"
 * @returns {Object} The query object
 */
exports.applyState = function (query = {}, state) {
  switch (state) {
  case 'trashed':
    query.trashed = true;
    break;
  case 'all':
    break;
  default:
    query.trashed = null;
  }
  return query;
};

exports.noDeletions = function (query) {
  query.deleted = null;
  return query;
};
