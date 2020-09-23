/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const bluebird = require('bluebird');

const UsersRepository = require('components/business/src/users/repository');
const User = require('components/business/src/users/User');

class Size {

  userEventsStorage;
  dbDocumentsItems;
  attachedFilesItems;
  usersRepository: UsersRepository;

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
    this.usersRepository = new UsersRepository(this.userEventsStorage);
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
    let userObject = new User(user);
    await this.usersRepository.updateOne(userObject, storageUsed);

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