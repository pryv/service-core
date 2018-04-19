// @flow

// Exports from the metadata package; mostly interfaces that the rpc server
// implements for construction of rpc clients. 

import type { IMetadataUpdaterService, IUpdateRequest, IUpdateResponse, IPendingUpdate } from './metadata_updater/interface';
export type { IMetadataUpdaterService, IUpdateRequest, IUpdateResponse, IPendingUpdate };

const updaterDefinition = require('./metadata_updater/definition');

module.exports = {
  updater: {
    definition: updaterDefinition.produce(),
  },
};
