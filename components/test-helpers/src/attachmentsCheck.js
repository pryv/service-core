// @flow

/**
 * Test helper functions for attached files.
 */

var childProcess = require('child_process'),
    path = require('path'),
    testData = require('./data'),
    eventFilesStorage = require('./dependencies').storage.user.eventFiles;

// Returns an empty string if the tested file attached to the specified event
// is identical to the original file. (Runs command-line util `cmp`
// underneath).
// 
exports.compareTestAndAttachedFiles = function (
  user: mixed, eventId: string, fileId: string, originalFileName: ?string) 
{
  if (originalFileName == null) {
    originalFileName = fileId;
  }
  return cmp(
    eventFilesStorage.getAttachedFilePath(user, eventId, fileId),
    path.join(testData.attachmentsDirPath, originalFileName));
};

function cmp(filePathA, filePathB) {
  return childProcess.execSync('cmp "' + filePathA + '" "' + filePathB + '"').toString();
}
