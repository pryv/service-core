/**
 * Helpers for tracking changes made to data objects.
 */

var timestamp = require('unix-timestamp');

exports.initProperties = initProperties;
function initProperties(authorId, item) {
  item.created = timestamp.now();
  item.createdBy = authorId;
  return updateProperties(authorId, item);
}

exports.updateProperties = updateProperties;
function updateProperties(authorId, updatedData) {
  updatedData.modified = timestamp.now();
  updatedData.modifiedBy = authorId;
  return updatedData;
}
