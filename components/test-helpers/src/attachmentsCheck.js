// @flow

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
  user: mixed, eventId: string, fileId: string, originalFileName: ?string,
) {
  if (originalFileName == null) {
    originalFileName = fileId;
  }
  return cmp(
    eventFilesStorage.getAttachedFilePath(user, eventId, fileId),
    path.join(testData.attachmentsDirPath, originalFileName),
  );
};

function cmp(filePathA, filePathB) {
  return childProcess.execSync(`cmp "${filePathA}" "${filePathB}"`).toString();
}
