/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const SystemStreamsSerializer = require('business/src/system-streams/serializer');


module.exports = async function platformCheckIntegrity(platformWideDB) {
  const { getUsersRepository } = require('business/src/users/repository'); // to avoid some circular import

  // --- platformDB
  const allEntries = platformWideDB.getAllWithPrefix('user');
  const platformEntryByUser = {};
  for (const entry of allEntries) {
    if (platformEntryByUser[entry.username] == null) platformEntryByUser[entry.username] = {};
    platformEntryByUser[entry.username][entry.field] = { value: entry.value, isUnique: entry.isUnique };
  }
  

  const errors = [];


  // Retrieve all existing users
  const usersRepository = await getUsersRepository();
  const users = await usersRepository.getAll();
  const indexedFields = SystemStreamsSerializer.getIndexedAccountStreamsIdsWithoutPrefix();

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    const username = user.username;
    for (const field of indexedFields) {
      const value = user[field];
      if (value == null) continue;
      const isUnique = SystemStreamsSerializer.isUniqueAccountField(field);

      if (platformEntryByUser[username] == null) {
        errors.push(`Cannot find username [${username}] data in -platform- while looking for field [${field}]`);
        continue;
      }
      if (platformEntryByUser[username][field].value != value) {
        errors.push(`Expected value [${value}] of field [${field}] for username [${username}] in -platform- found value :  [${platformEntryByUser[username][field].value}]`);
        continue;
      }

      if (platformEntryByUser[username][field].isUnique != isUnique) {
        const txt = isUnique ? 'unique found indexed' : 'indexed found unique';
        errors.push(`Expected value [${value}] of field [${field}] for username [${username}] in -platform- to be ${txt}`);
        continue;
      }
      delete platformEntryByUser[username][field];
      if (Object.keys(platformEntryByUser[username]).length == 0) delete platformEntryByUser[username];
    }
  }
  for (const username of Object.keys(platformEntryByUser)) {
    for (const field of Object.keys(platformEntryByUser[username])) {
      errors.push(`Cannot find field [${field}] for username [${username}] in -platform-`);
    }
  }
  return errors;
}