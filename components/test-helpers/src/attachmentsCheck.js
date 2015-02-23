/**
 * Test helper functions for attached files.
 */

var childProcess = require('child_process'),
    path = require('path'),
    testData = require('./data'),
    eventFilesStorage = require('./dependencies').storage.user.eventFiles;

/**
 * Returns an empty string if the tested file attached to the specified event is identical to the
 * original file. (Runs command-line util `cmp` underneath.)
 *
 * @param {Object} user
 * @param {String} eventId
 * @param {String} fileId
 * @param {String} originalFileName The name of the original file (in test data), if different from
 *                                  fileName. Optional.
 */
exports.compareTestAndAttachedFiles = function (user, eventId, fileId, originalFileName) {
  if (! originalFileName) {
    originalFileName = fileId;
  }
  return cmp(eventFilesStorage.getAttachedFilePath(user, eventId, fileId),
             path.join(testData.attachmentsDirPath, originalFileName));
};

function cmp(filePathA, filePathB) {
  return childProcess.execSync('cmp "' + filePathA + '" "' + filePathB + '"').toString();
}
