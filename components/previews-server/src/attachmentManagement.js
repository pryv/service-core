/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const mkdirp = require('mkdirp');
const path = require('path');
const fs = require('fs');
const { getConfigUnsafe } = require('@pryv/boiler');

const previewsDirPath = getConfigUnsafe(true).get('eventFiles:previewsDirPath');

/**
 * Ensures the preview path for the specific event exists.
 * Only support JPEG preview images (fixed size) at the moment.
 *
 * @param {Object} user
 * @param {String} eventId
 * @param {Number} dimension
 */
async function ensurePreviewPath (user, eventId, dimension) {
  const dirPath = path.join(previewsDirPath, user.id, eventId);
  await mkdirp(dirPath);
  return path.join(dirPath, getPreviewFileName(dimension));
}

exports.ensurePreviewPath = ensurePreviewPath;

/**
 * @param {Object} user
 * @param {String} eventId
 * @param {Number} dimension
 * @returns {String}
 */
function getPreviewPath (user, eventId, dimension) {
  return path.join(previewsDirPath, user.id, eventId, getPreviewFileName(dimension));
}
exports.getPreviewPath = getPreviewPath;

function getPreviewFileName (dimension) {
  return dimension + '.jpg';
}

/**
 * Primarily meant for tests.
 * Synchronous until all related code is async/await.
 */
function removeAllPreviews () {
  fs.rmSync(previewsDirPath, { recursive: true, force: true });
}
exports.removeAllPreviews = removeAllPreviews;
