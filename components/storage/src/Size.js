/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
var async = require('async');

module.exports = Size;

/**
 * Computes storage size used by user accounts.
 * Will sum sizes returned by `getTotalSize(user, callback)` on the given storage objects,
 * if function is present.
 *
 * @param {Array} dbDocumentsItems
 * @param {Array} attachedFilesItems
 * @constructor
 */
function Size (userEventsStorage, dbDocumentsItems, attachedFilesItems) {
  this.userEventsStorage = userEventsStorage;
  this.dbDocumentsItems = dbDocumentsItems;
  this.attachedFilesItems = attachedFilesItems;
}

/**
 * Computes and updates storage size for the given user.
 *
 * @param {Object} user
 * @param {Function} callback
 */
Size.prototype.computeForUser = function (user, callback) {
  async.series({
    dbDocuments: computeCategory.bind(this, this.dbDocumentsItems),
    attachedFiles: computeCategory.bind(this, this.attachedFilesItems)
  }, function (err, storageUsed) {
      // update logic TODO IEVA
    if (err) { return callback(err); }
      this.userEventsStorage.updateOne(
        { id: user.id },
        { storageUsed: storageUsed }, function (err) {
      if (err) { return callback(err); }
      callback(null, storageUsed);
    });
  }.bind(this));

  function computeCategory(storageItems, callback) {
    var total = 0;
    async.each(storageItems, function (storage, itemDone) {
      if (typeof storage.getTotalSize !== 'function') { return; }

      storage.getTotalSize(user, function (err, size) {
        if (err) { return itemDone(err); }
        total += size;
        itemDone();
      });
    }.bind(this), function (err) {
      callback(err, total);
    });
  }
};
