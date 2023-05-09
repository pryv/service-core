/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Test helper functions for attached files.
 */
const childProcess = require('child_process');
const path = require('path');
const testData = require('./data');
const eventFilesStorage = require('./dependencies').storage.user.eventFiles;
// Returns an empty string if the tested file attached to the specified event
// is identical to the original file. (Runs command-line util `cmp`
// underneath).
//
exports.compareTestAndAttachedFiles = function (user, eventId, fileId, originalFileName) {
  if (originalFileName == null) {
    originalFileName = fileId;
  }
  return cmp(eventFilesStorage.getAttachmentPath(user.id, eventId, fileId), path.join(testData.testsAttachmentsDirPath, originalFileName));
};
/**
 * @returns {any}
 */
function cmp (filePathA, filePathB) {
  return childProcess
    .execSync('cmp "' + filePathA + '" "' + filePathB + '"')
    .toString();
}
