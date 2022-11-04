/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

/**
 * ToolSet to manipulate User's local directory
 */

const path = require('path');
const rimraf = require('rimraf');
const bluebird = require('bluebird');
const mkdirp = require('mkdirp');
const fs = require('fs');

const { getConfig, getLogger } = require('@pryv/boiler');
const logger = getLogger('user-local-directory');

module.exports = {
  init,
  ensureUserDirectory,
  pathForuserId,
  pathForAttachment,
  deleteUserDirectory,
  getBasePath,
  foreachUserDirectory,
  setBasePathTestOnly
};
let config;
let basePath;
let attachmentsBasePath;

// temporarly set baseBath for tests;
function setBasePathTestOnly(path) {
  basePath = path || config.get('userFiles:path');
}


/**
 * Load config and make sure baseUserDirectory exists
 * This could also handle eventual migrations
 */
async function init () {
  if (basePath) return;
  config = await getConfig();
  const candidateBasePath = config.get('userFiles:path');
  mkdirp.sync(candidateBasePath);
  basePath = candidateBasePath;

  const candidateAttachmentsBasePath = config.get('eventFiles:attachmentsDirPath');
  mkdirp.sync(candidateAttachmentsBasePath);
  attachmentsBasePath = candidateAttachmentsBasePath;

  logger.debug('User local files: ' + basePath + '  Attachments in: ' + attachmentsBasePath);
}

/**
 * Return and **creates** the desired user path
 * @param {string} userId -- user id (cuid format)
 * @param {string} [extraPath] -- Optional, extra path
 */
async function ensureUserDirectory (userId, extraPath = '') {
  const resultPath = pathForuserId(userId, extraPath);
  await mkdirp(resultPath); // ensures directory exists
  return resultPath;
}

/**
 * Return the local storage for this user. (does not create it)
 * @param {string} userId -- user id (cuid format)
 * @param {string} [extraPath] -- Optional, extra path
 */
function pathForuserId (userId, extraPath = '') {
  if (basePath == null) {
    throw new Error('Run init() first');
  }
  if (!userId || userId.length < 3) {
    throw new Error('Invalid or too short userId: ' + userId);
  }
  const dir1 = userId.substr(userId.length - 1, 1); // last character of id
  const dir2 = userId.substr(userId.length - 2, 1);
  const dir3 = userId.substr(userId.length - 3, 1);
  const resultPath = path.join(basePath, dir1, dir2, dir3, userId, extraPath);
  return resultPath;
}

/**
 * Return the full file path for this attachment
 * TODO: cleanup – currently unused; duplicate of storage/user/EventFiles.getAttachmentPath()
 * @param {string} userId
 * @param {string} eventId
 * @param {string} fileId
 * @param {boolean} [ensureDirs] - default: false creates needed directories if set
 */
function pathForAttachment (userId, eventId, fileId, ensureDirs = false) {
  if (attachmentsBasePath == null) {
    throw new Error('Run init() first');
  }
  return path.join(attachmentsBasePath, userId, eventId, fileId);
}

/**
 * Delete user data folder
 *
 * @param {*} userId -- user id
 */
async function deleteUserDirectory (userId) {
  const userFolder = pathForuserId(userId);
  await bluebird.fromCallback(cb => rimraf(userFolder, { disableGlob: true }, cb));
}

function getBasePath () {
  if (basePath == null) {
    throw new Error('Initialize UserLocalDirectory first');
  }
  return basePath;
}

/**
 * @param {Function} asyncCallBack(uid, path)
 * @param {string} [userDataPath] -- Optional, user data path
 * @param {string} [logger] -- Optional, logger
 */
async function foreachUserDirectory (asyncCallBack, userDataPath, logger) {
  logger = logger || getLogger('user-local-directory:foreachUserDirectory');
  await loop(userDataPath || basePath, '');

  async function loop (loopPath, tail) {
    const fileNames = fs.readdirSync(loopPath);

    for (const fileName of fileNames) {
      if (tail.length < 3 && fileName.length !== 1) { logger.warn('Skipping no 1 char' + fileName); continue; }
      const myDirPath = path.join(loopPath, fileName);
      if (!fs.statSync(myDirPath).isDirectory()) { logger.warn('Skipping File' + fileName); continue; }
      const myTail = fileName + tail;

      if (tail.length < 3) {
        await loop(myDirPath, myTail);
      } else {
        if (!fileName.endsWith(tail)) { logger.warn('Skipping not valid userDir' + myDirPath); continue; }
        await asyncCallBack(fileName, myDirPath);
      }
    }
  }
}
