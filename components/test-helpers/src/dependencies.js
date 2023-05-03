/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const storage = require('storage');
const _ = require('lodash');

const { getConfigUnsafe, getLogger } = require('@pryv/boiler');
const config = getConfigUnsafe(true);

const database = storage.getDatabaseSync(true);

/**
 * Test process dependencies.
 */
const deps = module.exports = {
  settings: config.get(),
  storage: {
    database,
    versions: new storage.Versions(database, getLogger('versions')),
    passwordResetRequests: new storage.PasswordResetRequests(database),
    sessions: new storage.Sessions(database),
    user: {
      accesses: new storage.user.Accesses(database),
      eventFiles: new storage.user.EventFiles(),
      followedSlices: new storage.user.FollowedSlices(database),
      streams: new storage.user.Streams(database), // TODO: reomove when mall is fully implemented for streams
      profile: new storage.user.Profile(database),
      webhooks: new storage.user.Webhooks(database)
    }
  }
};
// this is call by global.test.js to initialized async components.
deps.init = async function init () {
  await deps.storage.user.eventFiles.init();
};

const dbDocumentsItems = _.values(_.pick(deps.storage.user,
  'accesses', 'followedSlices', 'profile'));
const attFilesItems = _.values(_.pick(deps.storage.user, 'eventFiles'));
deps.storage.size = new storage.Size(dbDocumentsItems, attFilesItems);
