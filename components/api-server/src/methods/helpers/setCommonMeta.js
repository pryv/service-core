// @flow

const timestamp = require('unix-timestamp');
const _ = require('lodash');
const { ProjectVersion } = require('components/middleware/src/project_version');
import type { ConfigAccess } from './settings';

type MetaInfo = {
  meta: {
    apiVersion: string, 
    serverTime: number, 
    serial: string
  }
}

// NOTE There's really no good way to wait for an asynchronous process in a 
//  synchronous method. But we don't want to modify all the code that uses
//  setCommonMeta either; ideally, we'd have a chain of dependencies leading
//  here and this would have some state. Then we could load the version once 
//  and store it forever. This (init and memoise) is the next best thing. 

// Memoised copy of the current project version. 
let version: string = 'n/a';
let serial: string = 'n/a';

// Initialise the project version as soon as we can. 
const pv = new ProjectVersion(); 
(async () => {
  version = await pv.version();
})();

/**
 * Adds common metadata (API version, server time) in the `meta` field of the given result,
 * initializing `meta` if missing.
 *
 * Warning : the new `settings` parameter is a slight "hack" (almost like `version`)
 * to set and cache the serial when core starts.
 * We REALLY should refactor this method.
 *
 * @param result {Object} Current result. MODIFIED IN PLACE. 
 */
module.exports = function <T: Object>(result: T, settings: ?ConfigAccess): T & MetaInfo {
  if (result.meta == null) {
    result.meta = {};
  }

  // See warning in the doc above
  if(settings) {
    try {
      serial = settings.get('serial').str();
    }
    catch(error){}
  }

  _.extend(result.meta, {
    apiVersion: version,
    serverTime: timestamp.now(),
    serial: serial
  });
  return result;
};
