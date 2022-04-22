/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// @flow
const Deletion = require('business/src/auth/deletion');
const { getStorageLayer } = require('storage');
const { getLogger, getConfig } = require('@pryv/boiler');

/**
 * Auth API methods implementations.
 *
 * @param api
 * @param userAccessesStorage
 * @param sessionsStorage
 * @param authSettings
 */
module.exports = async function(
  api: any
) {
  const config = await getConfig();
  const logging = getLogger('delete');
  const storageLayer = await getStorageLayer();
  const deletion: Deletion = new Deletion(logging, storageLayer, config);

  api.register(
    'auth.delete',
    deletion.checkIfAuthorized.bind(deletion),
    deletion.validateUserExists.bind(deletion),
    deletion.validateUserFilepaths.bind(deletion),
    deletion.deleteUserFiles.bind(deletion),
    deletion.deleteHFData.bind(deletion),
    deletion.deleteAuditData.bind(deletion),
    deletion.deleteOnRegister.bind(deletion),
    deletion.deleteUser.bind(deletion)
  );
};
