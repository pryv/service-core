/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// 

// Exports from the metadata package; mostly interfaces that the rpc server
// implements for construction of rpc clients. 


const updaterDefinition = require('./metadata_updater/definition');

module.exports = {
  updater: {
    definition: updaterDefinition.produce(),
  },
};
