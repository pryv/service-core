// @flow

// Exports from the metadata package; mostly interfaces that the rpc server
// implements for construction of rpc clients. 

import type { IMetadataUpdaterService, IUpdateRequest, IUpdateResponse } from './metadata_updater/interface';
export type { IMetadataUpdaterService, IUpdateRequest, IUpdateResponse };

const updaterDefinition = require('./metadata_updater/definition');

module.exports = {
  updater: {
    definition: updaterDefinition.produce(),
  },
};
