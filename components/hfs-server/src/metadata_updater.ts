/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// A client for the MetadataUpdater service in the metadata component.

const rpc = require('tprpc');
const metadata = require('metadata');

import type {
  IMetadataUpdaterService,
  IUpdateResponse,
  IPendingUpdate,
} from 'metadata';

async function produceMetadataUpdater(
  endpoint: string
): Promise<IMetadataUpdaterService> {
  const definition = await metadata.updater.definition;
  const client = new rpc.Client(definition);
  return client.proxy('MetadataUpdaterService', endpoint);
}

// A null object that implements the MetadataUpdaterService interface; if no
// connection to an updater is configured in the configuration file, this will
// be used - and no updates will be made.
//
class MetadataForgetter implements IMetadataUpdaterService {
  logger;

  constructor(logger) {
    this.logger = logger;
  }

  async scheduleUpdate /* req: IUpdateRequest */(): Promise<IUpdateResponse> {
    const logger = this.logger;

    logger.info(
      'Metadata of events will NOT be updated; please configure the metadata update service.'
    );

    // Returns the present instant as a deadline, since the operation is
    // considered complete.
    return {
      deadline: new Date() / 1e3,
    };
  }

  async getPendingUpdate /* req: IUpdateId */(): Promise<IPendingUpdate> {
    return {
      found: false,
      deadline: new Date() / 1e3,
    };
  }
}

module.exports = {
  produce: produceMetadataUpdater,
  MetadataForgetter,
};
