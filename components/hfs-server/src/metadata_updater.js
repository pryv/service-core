/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// A client for the MetadataUpdater service in the metadata component.
const rpc = require('tprpc');
const metadata = require('metadata');
/**
 * @param {string} endpoint
 * @returns {Promise<any>}
 */
async function produceMetadataUpdater (endpoint) {
  const definition = await metadata.updater.definition;
  const client = new rpc.Client(definition);
  return client.proxy('MetadataUpdaterService', endpoint);
}
// A null object that implements the MetadataUpdaterService interface; if no
// connection to an updater is configured in the configuration file, this will
// be used - and no updates will be made.
//

class MetadataForgetter {
  logger;
  constructor (logger) {
    this.logger = logger;
  }

  /**
   * @returns {Promise<any>}
   */
  async scheduleUpdate /* req: IUpdateRequest */() {
    const logger = this.logger;
    logger.info('Metadata of events will NOT be updated; please configure the metadata update service.');
    // Returns the present instant as a deadline, since the operation is
    // considered complete.
    return {
      deadline: new Date() / 1e3
    };
  }

  /**
   * @returns {Promise<any>}
   */
  async getPendingUpdate /* req: IUpdateId */() {
    return {
      found: false,
      deadline: new Date() / 1e3
    };
  }
}
module.exports = {
  produce: produceMetadataUpdater,
  MetadataForgetter
};
