/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const { getUsersRepository, UserRepositoryOptions, User } = require('business/src/users');
const { getMall } = require('mall');

class Size {
  /**
   * Computes and updates storage size for the given user.
   *
   * @param {Object} user
   */
  async computeForUser (user) {
    const mall = await getMall();
    const storageInfo = await mall.getUserStorageInfos(user.id);
    let dbDocuments = 0;
    let attachedFiles = 0;
    for (const entry of Object.entries(storageInfo)) {
      if (entry.streams?.count) dbDocuments += entry.streams?.count;
      if (entry.events?.count) dbDocuments += entry.events?.count;
      if (entry.files?.sizeKb) attachedFiles += entry.files?.sizeKb;
    }
    // reconstruct previous system
    const storageUsed = {
      dbDocuments,
      attachedFiles
    };
    const userObject = new User(user);
    const usersRepository = await getUsersRepository();
    await usersRepository.updateOne(
      userObject,
      storageUsed,
      UserRepositoryOptions.SYSTEM_USER_ACCESS_ID
    );

    return storageInfo;
  }
}
module.exports = Size;
