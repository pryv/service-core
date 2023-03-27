/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const SystemStreamsSerializer = require('business/src/system-streams/serializer');

module.exports = async function platformCheckIntegrity (platformWideDB) {
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
  const usersFromRepository = await usersRepository.getAll();
  const indexedFields = SystemStreamsSerializer.getIndexedAccountStreamsIdsWithoutPrefix();

  const infos = {
    usersCountOnPlatform: Object.keys(platformEntryByUser).length,
    usersCountOnRepository: usersFromRepository.length
  };

  for (let i = 0; i < usersFromRepository.length; i++) {
    const userRepo = usersFromRepository[i];
    if (userRepo == null) {
      errors.push('Found null or undefined user in usersRepository when listing with getAll()"');
      continue;
    }
    const username = userRepo.username;
    if (username == null) {
      errors.push('Found null or undefined username in usersRepository for user with id: "' + userRepo.id + '"');
      continue;
    }

    for (const field of indexedFields) {
      const valueRepo = userRepo[field];

      if (valueRepo == null) continue; // we do not expect to find null values in repo

      const isUnique = SystemStreamsSerializer.isUniqueAccountField(field);

      if (platformEntryByUser[username] == null) {
        errors.push(`Cannot find username "${username}" data in platform db while looking for field "${field}" expected value:  "${valueRepo}"`);
        continue;
      } else if (platformEntryByUser[username][field] == null) {
        errors.push(`Cannot find field "${field}" for username "${username}" in the platform db expected value is :  "${valueRepo}"`);
      } else if (platformEntryByUser[username][field].value !== valueRepo) {
        errors.push(`Expected value "${valueRepo}" of field "${field}" for username "${username}" in the platform db but found value :  "${platformEntryByUser[username][field].value}"`);
      } else if (platformEntryByUser[username][field].isUnique !== isUnique) {
        const txt = isUnique ? 'unique found indexed' : 'indexed found unique';
        errors.push(`Expected value "${valueRepo}" of field "${field}" for username "${username}" in the platform db to be "${txt}"`);
      }
      // all tests passed delete entry from platformEntryByUser
      delete platformEntryByUser[username][field];
      // if user in platformEntryByUser is empty delete it
      if (Object.keys(platformEntryByUser[username]).length === 0) delete platformEntryByUser[username];
    }
  }

  // data left in platformEntryByUser is what has not be found in users from repository
  for (const username of Object.keys(platformEntryByUser)) {
    const userFromRepository = await usersRepository.getUserByUsername(username);
    if (userFromRepository == null) {
      errors.push(`Found data for user with username "${username}" in the platform db but cannot find this user in the Repository (System Streams)`);
    }
    for (const field of Object.keys(platformEntryByUser[username])) {
      errors.push(`Found field "${field}" with value: "${platformEntryByUser[username][field].value}" for username "${username}" in the platform db but not in the Repository (System Streams)`);
    }
  }
  return {
    title: 'Platform DB vs users repository',
    infos,
    errors
  };
};
