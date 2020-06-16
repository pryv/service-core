const async = require('async');

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
function Size(usersStorage, dbDocumentsItems, attachedFilesItems) {
  this.usersStorage = usersStorage;
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
    attachedFiles: computeCategory.bind(this, this.attachedFilesItems),
  }, (err, storageUsed) => {
    if (err) { return callback(err); }
    this.usersStorage.updateOne({ id: user.id }, { storageUsed }, (err) => {
      if (err) { return callback(err); }
      callback(null, storageUsed);
    });
  });

  function computeCategory(storageItems, callback) {
    let total = 0;
    async.each(storageItems, (storage, itemDone) => {
      if (typeof storage.getTotalSize !== 'function') { return; }

      storage.getTotalSize(user, (err, size) => {
        if (err) { return itemDone(err); }
        total += size;
        itemDone();
      });
    }, (err) => {
      callback(err, total);
    });
  }
};
