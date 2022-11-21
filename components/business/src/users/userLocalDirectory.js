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
  setBasePathTestOnly
};

let config;
let basePath;
let attachmentsBasePath;

// temporarly set baseBath for tests;
function setBasePathTestOnly (path) {
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
