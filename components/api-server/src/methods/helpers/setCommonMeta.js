'use strict';

const thisPackage = require('../../../package.json'),
      timestamp = require('unix-timestamp'),
      _ = require('lodash');

/**
 * Adds common metadata (API version, server time) in the `meta` field of the given result,
 * initializing `meta` if missing.
 *
 * @param result {Object} Current result. MODIFIED IN PLACE. 
 */
module.exports = function (result) {
  if (! result.meta) {
    result.meta = {};
  }
  _.extend(result.meta, {
    apiVersion: thisPackage.version,
    serverTime: timestamp.now()
  });
  return result;
};
