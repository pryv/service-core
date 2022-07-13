/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const bluebird = require('bluebird');

/**
 * Check the integrity of the userIndex compared to the username events in SystemStreams
 * @param {*} userIndex 
 * @returns {Array<string>} of error messages if any discrepencies is found
 */
module.exports = async function checkIntegrity (usersIndex) {
  const usernamesFromEvents = await getUsersNamesFromEvents();
  const errors = [];
  
  // check that all users are migrated
  const userIndexUsers = await usersIndex.allUsersMap();
  for ([username, userId] of Object.entries(usernamesFromEvents)) {
    if (userIndexUsers[username]) {
      if (userIndexUsers[username] != userId) {
        errors.push(`UserIds do not match for username [${username}] events: [${userId}] userIndex: [${userIndexUsers}]`);
      }
    } else {
      errors.push(`Username [${username}] with userId: [${userId}] found in -events- but not in -userIndex-`);
    }
    delete userIndexUsers[username];
  }

  for ([username, userId] of Object.entries(userIndexUsers)) {
    errors.push(`Username [${username}] with userId: [${userId}] found in -userIndex- but not in -events-`);
  }
  return errors;
}
  

async function getUsersNamesFromEvents() {
  const { getDatabase } = require('storage'); // placed here to avoid some circular dependency

  const database = await getDatabase();
  const eventsCollection = await bluebird.fromCallback(cb => database.getCollection({ name: 'events' }, cb));
  const query =  { streamIds: { $in: [':_system:username'] } };
  const cursor = await eventsCollection.find(query, {projection: {userId: 1, content: 1}});

  const users = {};
  while (await cursor.hasNext()) {
    const user = await cursor.next();
    users[user.content] = user.userId;
  }
  return users;
}