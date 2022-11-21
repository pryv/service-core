/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const bluebird = require('bluebird');

const { getUsersRepository, UserRepositoryOptions, User } = require('business/src/users');
const { getMall } = require('mall');

class Size {
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
  constructor (dbDocumentsItems, attachedFilesItems) {
    this.dbDocumentsItems = dbDocumentsItems;
    this.attachedFilesItems = attachedFilesItems;
  }

  /**
   * Computes and updates storage size for the given user.
   *
   * @param {Object} user
   */
  async computeForUser (user) {
    const mall = await getMall();
    const mallSize = await mall.getUserStorageSize(user.id);
    const storageUsed = {
      dbDocuments: mallSize + (await computeCategory(this.dbDocumentsItems)),
      attachedFiles: await computeCategory(this.attachedFilesItems)
    };
    const userObject = new User(user);
    const usersRepository = await getUsersRepository();
    await usersRepository.updateOne(
      userObject,
      storageUsed,
      UserRepositoryOptions.SYSTEM_USER_ACCESS_ID
    );

    return storageUsed;

    async function computeCategory (storageItems) {
      let total = 0;
      for (let i = 0; i < storageItems.length; i++) {
        if (typeof storageItems[i].getTotalSize !== 'function') { return; }
        const size = await bluebird.fromCallback(cb => storageItems[i].getTotalSize(user, cb));
        total += size;
      }
      return total;
    }
  }
}
module.exports = Size;
