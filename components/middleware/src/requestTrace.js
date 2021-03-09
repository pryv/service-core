/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
'use strict'; 
// @flow

const inspect = require('util').inspect;
const morgan = require('morgan');
const { getLogger } = require('@pryv/boiler');

const QUERY_PARAMS_WHITELIST = [
  'fromTime', 'toTime', 'streams', 'tags', 'types', 'running', 'sortAscending', 'skip', 'limit', 'state', 'modifiedSince', 'includeDeletions',
  'includeHistory',
  'fromDeltaTime', 'toDeltaTime',
  'parentId', 'state', 'includeDeletionsSince',
  'includeExpired', 'includeDeletions',
  'requestingAppId', 'deviceName', 'requestedPermissions',
  'accessId', 'fromTime', 'toTime', 'status', 'ip', 'httpVerb', 'resource', 'errorId',
];
const allowedMap = {}
QUERY_PARAMS_WHITELIST.map(param => {
  allowedMap[param] = true;
});

morgan.token('cleanQuery', function (req) {
  if (req.query == null) return '-'
  let cleanQuery = '';

  for (const [key, value] of Object.entries(req.query)) {
    if (allowedMap[key]) {
      cleanQuery += key + '=' + inspect(value) + '&';
    }
  }
  cleanQuery = cleanQuery.slice(0, cleanQuery.length - 1);
  return cleanQuery;
});

morgan.token('path', function (req) {
  return req.path;
});

module.exports = function (express: any) {
  const logger = getLogger('request-trace');
  const morganLoggerStreamWrite = (msg: string) => logger.info(msg);
  
  // based on 'combined', but with whitelisted query params: https://www.npmjs.com/package/morgan#combined
  return morgan(':remote-addr - [:date[clf]] ":method :path :cleanQuery HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"', 
    {
      stream: {
        write: morganLoggerStreamWrite
    },
  });
};
