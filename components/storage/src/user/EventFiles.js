/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const cuid = require('cuid');
const fs = require('fs');
const mkdirp = require('mkdirp');
const path = require('path');

const { toString } = require('utils');
const { pipeline } = require('stream/promises');
const { getConfig, getLogger } = require('@pryv/boiler');
const userLocalDirectory = require('../userLocalDirectory');

const ATTACHMENT_DIRNAME = 'attachments';

module.exports = EventFiles;
/**
 * Manages files storage for events (attachments & previews).
 *
 */
function EventFiles () { }

EventFiles.prototype.init = async function () {
  const config = await getConfig();
  this.settings = config.get('eventFiles');
  this.logger = getLogger('storage:eventFiles');
  await userLocalDirectory.init();
};

/**
 * Computes the total storage size of the given user's attached files, in bytes.
 *
 * @param {Object} user
 * @returns {Promise<number>}
 */
EventFiles.prototype.getTotalSize = async function (user) {
  const userPath = this.getUserPath(user.id);
  try {
    await fs.promises.access(userPath);
  } catch (err) {
    this.logger.debug('No attachments dir for user ' + toString.user(user));
    return 0;
  }
  return getDirectorySize(userPath);
};

/**
 *
 * @param {string} dirPath
 * @returns {Promise<number>}
 */
async function getDirectorySize (dirPath) {
  const files = await fs.promises.readdir(dirPath, { withFileTypes: true });

  const paths = files.map(async file => {
    const filePath = path.join(dirPath, file.name);
    if (file.isDirectory()) {
      return await getDirectorySize(filePath);
    }
    if (file.isFile()) {
      const { size } = await fs.promises.stat(filePath);
      return size;
    }
    return 0;
  });

  return (await Promise.all(paths)).flat(Infinity).reduce((i, size) => i + size, 0);
}

/**
 * @param tempPath The current, temporary path of the file to save (the file will actually be moved
 *                 from that path)
 */
EventFiles.prototype.saveAttachmentFromTemp = async function (tempPath, userId, eventId, fileId) {
  const readStream = fs.createReadStream(tempPath);
  fileId = await this.saveAttachmentFromStream(readStream, userId, eventId, fileId);
  await fs.promises.unlink(tempPath);
  return fileId;
};

EventFiles.prototype.saveAttachmentFromStream = async function (readableStream, userId, eventId, fileId) {
  fileId = fileId || cuid();
  const filePath = this.getAttachmentPath(userId, eventId, fileId);
  const dirPath = path.dirname(filePath);
  await mkdirp(dirPath);
  const writeStream = fs.createWriteStream(filePath);
  await pipeline(readableStream, writeStream);
  return fileId;
};

EventFiles.prototype.getAttachmentStream = function (userId, eventId, fileId) {
  const filePath = this.getAttachmentPath(userId, eventId, fileId);
  return fs.createReadStream(filePath);
};

EventFiles.prototype.removeAttachment = async function (userId, eventId, fileId) {
  const filePath = this.getAttachmentPath(userId, eventId, fileId);
  await fs.promises.unlink(filePath);
  await cleanupIfEmpty(path.dirname(filePath));
};

/**
 * Attempts to remove the given directory (if empty)
 */
async function cleanupIfEmpty (dirPath) {
  try {
    await fs.promises.rmdir(dirPath);
  } catch (err) {
    // assume dir is not empty
  }
}

EventFiles.prototype.removeAllForEvent = async function (userId, eventId) {
  const dirPath = this.getEventPath(userId, eventId);
  await fs.promises.rm(dirPath, { recursive: true, force: true });
};

/**
 * Synchronous until all related code is async/await.
 */
EventFiles.prototype.removeAllForUser = function (user) {
  fs.rmSync(this.getUserPath(user.id), { recursive: true, force: true });
};

/**
 * Primarily meant for tests.
 * Synchronous until all related code is async/await.
 */
EventFiles.prototype.removeAll = function () {
  fs.rmSync(this.settings.attachmentsDirPath, { recursive: true, force: true });
};

/**
 * @param {String} userId
 * @param {String} eventId
 * @param {String} fileId
 */
EventFiles.prototype.getAttachmentPath = function (userId, eventId, fileId) {
  return path.join(this.getEventPath(userId, eventId), fileId);
};

/**
 * @param {String} userId
 * @param {String} eventId
 */
EventFiles.prototype.getEventPath = function (userId, eventId) {
  return path.join(this.getUserPath(userId), eventId);
};

/**
 * @param {String} userId
 */
EventFiles.prototype.getUserPath = function (userId) {
  return userLocalDirectory.getPathForUser(userId, ATTACHMENT_DIRNAME);
};

/**
 * Ensures the preview path for the specific event exists.
 * Only support JPEG preview images (fixed size) at the moment.
 *
 * @param {Object} user
 * @param {String} eventId
 * @param {Number} dimension
 * @param {Function} callback (error, previewPath)
 */
EventFiles.prototype.ensurePreviewPath = function (user, eventId, dimension, callback) {
  const dirPath = path.join(this.settings.previewsDirPath, user.id, eventId);
  mkdirp(dirPath).then(function (res, err) {
    if (err) { return callback(err); }
    callback(null, path.join(dirPath, getPreviewFileName(dimension)));
  });
};

/**
 * @param {Object} user
 * @param {String} eventId
 * @param {Number} dimension
 * @returns {String}
 */
EventFiles.prototype.getPreviewPath = function (user, eventId, dimension) {
  return path.join(this.settings.previewsDirPath, user.id, eventId, getPreviewFileName(dimension));
};

function getPreviewFileName (dimension) {
  return dimension + '.jpg';
}

/**
 * Primarily meant for tests.
 * Synchronous until all related code is async/await.
 */
EventFiles.prototype.removeAllPreviews = function () {
  fs.rmSync(this.settings.previewsDirPath, { recursive: true, force: true });
};
