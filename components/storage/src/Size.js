/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const bluebird = require('bluebird');

const UserRepository = require('components/business/src/users/repository');

class Size {

  userEventsStorage;
  dbDocumentsItems;
  attachedFilesItems;

  /**
 * Computes storage size used by user accounts.
 * Will sum sizes returned by `getTotalSize(user, callback)` on the given storage objects,
 * if function is present.
 *
 * @param {Array} dbDocumentsItems
 * @param {Array} attachedFilesItems
 * @constructor
 */
  constructor(userEventsStorage, dbDocumentsItems, attachedFilesItems) {
    this.userEventsStorage = userEventsStorage;
    this.dbDocumentsItems = dbDocumentsItems;
    this.attachedFilesItems = attachedFilesItems;
}

  /**
   * Computes and updates storage size for the given user.
   *
   * @param {Object} user
   */
  async computeForUser(user) {
    const storageUsed = {
      dbDocuments: await computeCategory(this.dbDocumentsItems),
      attachedFiles: await computeCategory(this.attachedFilesItems),
    }
    const usersRepository = new UserRepository(this.userEventsStorage);
    await usersRepository.updateOne(user.id, storageUsed);

    return storageUsed;

    async function computeCategory(storageItems) {
      let total = 0;
      for (let i=0; i<storageItems.length; i++) {
        if (typeof storageItems[i].getTotalSize !== 'function') { return; }
        const size = await bluebird.fromCallback(cb => storageItems[i].getTotalSize(user, cb));
        total += size;
      }
      return total;
    }
  }
}
module.exports = Size;