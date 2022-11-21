/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
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
exports.compareTestAndAttachedFiles = function (
  user: unknown,
  eventId: string,
  fileId: string,
  originalFileName: string | undefined | null
) {
  if (originalFileName == null) {
    originalFileName = fileId;
  }
  return cmp(
    eventFilesStorage.getAttachedFilePath(user, eventId, fileId),
    path.join(testData.attachmentsDirPath, originalFileName)
  );
};

function cmp(filePathA, filePathB) {
  return childProcess
    .execSync('cmp "' + filePathA + '" "' + filePathB + '"')
    .toString();
}
