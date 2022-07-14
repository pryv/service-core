/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

/**
 * Check the integrity of the userIndex compared to the username events in SystemStreams
 * @param {*} userIndex -
 * @returns {Array<string>} of error messages if any discrepencies is found
 */
module.exports = async function checkIntegrity (usersIndex) {
  const errors = [];
  const infos = {};
  const checkedMap = {};

  for (const collectionName of ['events', 'streams', 'accesses', 'profile', 'webhooks', 'followedSlices']) {
    const userIds = await getAllKnownUserIdsFromDB(collectionName);
    infos['userIdsCount-' + collectionName] = userIds.length;

    for (const userId of userIds) {
      if (checkedMap[userId]) continue;
      const username = usersIndex.nameForId(userId);
      checkedMap[userId] = true;
      if (username == null) {
        errors.push(`Found userId [${userId}] in mongo collection : [${collectionName}] unkown in -userIndex-`);
        continue;
      }
    }
  }
  return {
    title: 'userIndex vs mongoDB',
    infos,
    errors
  };
};

async function getAllKnownUserIdsFromDB (collectionName) {
  const { getDatabase } = require('storage'); // placed here to avoid some circular dependency
  const database = await getDatabase();
  const collection = await database.getCollection({ name: collectionName });
  const userIds = await collection.distinct('userId', {});
  return userIds;
}
