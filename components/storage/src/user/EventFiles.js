/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const cuid = require('cuid');
const fs = require('fs');
const mkdirp = require('mkdirp');
const path = require('path');
const rimraf = require('rimraf');
const toString = require('utils').toString;

const bluebird = require('bluebird');
const { pipeline } = require('stream/promises');

module.exports = EventFiles;
/**
 * Manages files storage for events (attachments & previews).
 *
 */
function EventFiles (settings, logger) {
  this.settings = settings;
  this.logger = logger;
}

/**
 * Computes the total storage size of the given user's attached files, in bytes.
 *
 * @param {Object} user
 * @param {Function} callback
 */
EventFiles.prototype.getTotalSize = function (user, callback) {
  const userPath = this.getAttachmentPath(user.id);
  fs.access(userPath, fs.constants.R_OK, function (err) {
    const readable = err == null;
    if (!readable) {
      this.logger.debug('No attachments dir for user ' + toString.user(user));
      return callback(null, 0);
    }
    getSizeRecursive.call(this, userPath, callback);
  }.bind(this));
};

/**
 * Gets all files sizes assyncronously using generators
 */
async function * recursiveReadDirAsync (dir) {
  const dirents = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const dirent of dirents) {
    const filePath = path.resolve(dir, dirent.name);
    if (dirent.isDirectory()) {
      yield * recursiveReadDirAsync(filePath);
    } else {
      try {
        const fileStats = await fs.promises.stat(filePath);
        yield fileStats.size;
      } catch (err) {
        this.logger.error('Data corrupted; expected ' + toString.path(filePath) + ' to exist');
        yield 0;
      }
    }
  }
}

/**
 * @param filePath
 * @param callback
 * @this {EventFiles}
 */
function getSizeRecursive (filePath, callback) {
  (async () => {
    let total = 0;
    for await (const f of recursiveReadDirAsync(filePath)) {
      total += f;
    }
    callback(null, total);
  })();
}

/**
 * @param tempPath The current, temporary path of the file to save (the file will actually be moved
 *                 from that path)
 */
EventFiles.prototype.saveAttachedFileFromTemp = async function (tempPath, userId, eventId, fileId) {
  const readStream = fs.createReadStream(tempPath);
  fileId = await this.saveAttachedFileFromStream(readStream, userId, eventId, fileId);
  await fs.promises.unlink(tempPath);
  return fileId;
};

EventFiles.prototype.saveAttachedFileFromStream = async function (readableStream, userId, eventId, fileId) {
  fileId = fileId || cuid();
  const dirPath = this.getAttachmentPath(userId, eventId);
  await mkdirp(dirPath);
  const writeStream = fs.createWriteStream(path.join(dirPath, fileId));
  await pipeline(readableStream, writeStream);
  return fileId;
};

EventFiles.prototype.getAttachedFileStream = function (userId, eventId, fileId) {
  const filePath = this.getAttachmentPath(userId, eventId, fileId);
  return fs.createReadStream(filePath);
};

EventFiles.prototype.removeAttachedFile = async function (userId, eventId, fileId) {
  const filePath = this.getAttachmentPath(userId, eventId, fileId);
  await fs.promises.unlink(filePath);
  await bluebird.fromCallback((cb) => this.cleanupStructure(path.dirname(filePath), cb));
};

EventFiles.prototype.removeAllForEvent = async function (userId, eventId) {
  const dirPath = this.getAttachmentPath(userId, eventId);
  await bluebird.fromCallback((cb) => rimraf(dirPath, cb));
  await bluebird.fromCallback((cb) => this.cleanupStructure(path.dirname(dirPath), cb));
};

EventFiles.prototype.removeAllForUser = function (user, callback) {
  rimraf(this.getAttachmentPath(user.id), callback);
};

/**
 * Primarily meant for tests.
 *
 * @param callback
 */
EventFiles.prototype.removeAll = function (callback) {
  rimraf(this.settings.attachmentsDirPath, callback);
};

/**
 * @param {Object} user
 * @param {String} eventId
 * @param {String} fileId Optional
 * @returns {String}
 */
EventFiles.prototype.getAttachedFilePath = function (user /*, eventId, fileId */) {
  const args = [].slice.call(arguments);
  args[0] = user.id;
  return this.getAttachmentPath.apply(this, args);
};

/**
 * @private
 */
EventFiles.prototype.getAttachmentPath = function (/* userId, eventId, fileId */) {
  const args = [].slice.call(arguments);
  args.unshift(this.settings.attachmentsDirPath);
  return path.join.apply(null, args);
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
EventFiles.prototype.getPreviewFilePath = function (user, eventId, dimension) {
  return path.join(this.settings.previewsDirPath, user.id, eventId, getPreviewFileName(dimension));
};

function getPreviewFileName (dimension) {
  return dimension + '.jpg';
}

/**
 * Attempts to remove the given directory and its parents (if empty) until the root attachments
 * directory is reached.
 *
 * @private
 */
EventFiles.prototype.cleanupStructure = function cleanupStructure (dirPath, callback) {
  if (dirPath === this.settings.attachmentsDirPath) {
    return callback();
  }

  fs.rmdir(dirPath, function (err) {
    if (err) {
      // assume the dir is not empty
      return callback();
    }
    cleanupStructure.call(this, path.dirname(dirPath), callback);
  }.bind(this));
};
