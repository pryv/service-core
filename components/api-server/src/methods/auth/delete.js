/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// @flow
const Deletion = require('business/src/auth/deletion');

/**
 * Auth API methods implementations.
 *
 * @param api
 * @param userAccessesStorage
 * @param sessionsStorage
 * @param authSettings
 */
module.exports = function(
  api: any,
  logging: any,
  storageLayer: any,
  settings: any
) {
  const deletion: Deletion = new Deletion(logging, storageLayer, settings);

  api.register(
    'auth.delete',
    deletion.checkIfAuthorized.bind(deletion),
    deletion.validateUserExists.bind(deletion),
    deletion.validateUserFilepaths.bind(deletion),
    deletion.deleteUserFiles.bind(deletion),
    deletion.deleteHFData.bind(deletion),
    deletion.deleteUser.bind(deletion)
  );
};
