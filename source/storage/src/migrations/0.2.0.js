/**
 * Initial version (no actual data migration).
 */
module.exports = function (context, callback) {
  context.logInfo('Data version is now 0.2.0');
  callback();
};
