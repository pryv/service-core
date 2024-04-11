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

const { pipeline } = require('stream/promises');
const { getConfig, getLogger } = require('@pryv/boiler');
const userLocalDirectory = require('../userLocalDirectory');
const ds = require('@pryv/datastore');
const errors = ds.errors;

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
EventFiles.prototype.getFileStorageInfos = async function (userId) {
  const userPath = getUserPath(userId);
  try {
    await fs.promises.access(userPath);
  } catch (err) {
    this.logger.debug('No attachments dir for user ' + userId);
    return 0;
  }
  return getDirectorySize(userPath);
};

EventFiles.prototype.saveAttachmentFromStream = async function (readableStream, userId, eventId, fileId) {
  fileId = fileId || cuid();
  const filePath = getAttachmentPath(userId, eventId, fileId);
  const dirPath = path.dirname(filePath);
  await mkdirp(dirPath);
  const writeStream = fs.createWriteStream(filePath);
  await pipeline(readableStream, writeStream);
  return fileId;
};

EventFiles.prototype.getAttachmentStream = async function (userId, eventId, fileId) {
  const filePath = getAttachmentPath(userId, eventId, fileId);
  if (!fs.existsSync(filePath)) {
    throw errors.unknownResource('attachment', JSON.stringify({ userId, eventId, fileId }));
  }
  return fs.createReadStream(filePath);
};

EventFiles.prototype.removeAttachment = async function (userId, eventId, fileId) {
  const filePath = getAttachmentPath(userId, eventId, fileId);
  await fs.promises.unlink(filePath);
  await cleanupIfEmpty(path.dirname(filePath));
};

EventFiles.prototype.removeAllForEvent = async function (userId, eventId) {
  const dirPath = getEventPath(userId, eventId);
  await fs.promises.rm(dirPath, { recursive: true, force: true });
};

EventFiles.prototype.removeAllForUser = async function (userId) {
  fs.rmSync(getUserPath(userId), { recursive: true, force: true });
};

// -------------------- attach to store --------- //

/**
 * @param es {EventDataStore}
 */
EventFiles.prototype.attachToEventStore = function (es, setIntegrityOnEvent) {
  const eventFiles = this;
  es.getAttachment = async function getAttachment (userId, eventId, fileId) {
    return await eventFiles.getAttachmentStream(userId, eventId, fileId);
  };

  es.addAttachment = async function addAttachment (userId, eventId, attachmentItem, transaction) {
    delete attachmentItem.id;
    const fileId = await eventFiles.saveAttachmentFromStream(attachmentItem.attachmentData, userId, eventId);
    const attachment = Object.assign({ id: fileId }, attachmentItem);
    delete attachment.attachmentData;
    const event = await es.getOne(userId, eventId);
    event.attachments ??= [];
    event.attachments.push(attachment);
    setIntegrityOnEvent(event);
    await es.update(userId, event, transaction);
    return event;
  };

  es.deleteAttachment = async function deleteAttachment (userId, eventId, fileId, transaction) {
    const event = await es.getOne(userId, eventId);
    event.attachments = event.attachments.filter((attachment) => {
      return attachment.id !== fileId;
    });
    await eventFiles.removeAttachment(userId, eventId, fileId);
    setIntegrityOnEvent(event);
    await es.update(userId, event, transaction);
    return event;
  };
};

// -------------------- internals --------------- //

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
 * Attempts to remove the given directory (if empty)
 */
async function cleanupIfEmpty (dirPath) {
  try {
    await fs.promises.rmdir(dirPath);
  } catch (err) {
    // assume dir is not empty
  }
}

/**
 * @param {String} userId
 * @param {String} eventId
 * @param {String} fileId
 */
function getAttachmentPath (userId, eventId, fileId) {
  return path.join(getEventPath(userId, eventId), fileId);
}

/**
 * @param {String} userId
 * @param {String} eventId
 */
function getEventPath (userId, eventId) {
  return path.join(getUserPath(userId), eventId);
}

/**
 * @param {String} userId
 */
function getUserPath (userId) {
  return userLocalDirectory.getPathForUser(userId, ATTACHMENT_DIRNAME);
}
