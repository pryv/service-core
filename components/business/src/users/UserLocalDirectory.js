/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * ToolSet to manipulate User's local directory
 */
const path = require('path');
const fs = require('fs');

const mkdirp = require('mkdirp');

const { getConfig, getLogger } = require('@pryv/boiler');
const logger = getLogger('user-local-directory');

let basePath; 

/**
 * Return and **creates** the desired user path
 * @param {string} uid -- user id (cuid format)
 * @param {string} [extraPath] -- Optional, extra path 
 */
 function EnsurePathForUserid(userid, extraPath = '') {
  const resultPath = PathForUserid(userid, extraPath)
  mkdirp.sync(resultPath); // ensure directory exists
  return resultPath;
}

/**
 * Return the local storage for this user. (does not create it)
 * @param {string} uid -- user id (cuid format)
 * @param {string} [extraPath] -- Optional, extra path 
 */
function PathForUserid(userid, extraPath = '') {
  if (! basePath) {
    throw(new Error('Initialize UserLocalDirectory first'));
  }
  if (! userid || userid.length < 3) {
    throw(new Error('Invalid or too short userid: ' + userid));
  }
 const dir1 = userid.substr(userid.length - 1, 1); // last character of id
 const dir2 = userid.substr(userid.length - 2, 1); 
 const dir3 = userid.substr(userid.length - 3, 1); 
 const resultPath = path.join(basePath, dir1, dir2, dir3, userid, extraPath);
 return resultPath;
}

/**
 * Load config and make sure baseUserDirectory exists
 * This could also handle eventual migrations
 */
async function init() {
  if (basePath) {
    throw( new Error('user local directory already initaliazed'));
  }
  const config = await getConfig();
  const candidateBasePath = config.get('userFiles:path');
  mkdirp.sync(candidateBasePath);
  basePath = candidateBasePath;
  logger.debug('User local files: ' + basePath);
}


module.exports = {
  EnsurePathForUserid,
  PathForUserid,
  init
}