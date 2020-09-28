/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// @flow
const Deletion = require('components/business/src/auth/deletion');
const InfluxConnection = require('components/business/src/series/influx_connection');

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
  
  const host = settings.get('influxdb.host').str();
  const port = settings.get('influxdb.port').num();
  
  const influx = new InfluxConnection(
    { host: host, port: port },
    deletion.logger
  );

  api.register(
    'auth.delete',
    deletion.checkIfAuthorized.bind(deletion),
    deletion.validateUserExists.bind(deletion),
    deletion.validateUserFilepaths.bind(deletion),
    deletion.deleteUserFiles.bind(deletion),
    deleteHFData,
    deletion.deleteUser.bind(deletion)
  );

  async function deleteHFData (
    context: MethodContext,
    params: mixed,
    result: Result,
    next: ApiCallback
  ) {
    await influx.dropDatabase(`user.${params.username}`);

    next();
  }
};
