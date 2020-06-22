/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const Access = require('./user/Accesses');
const User = require('./Users');
const Stream = require('./user/Streams');
const StorageLayer = require('./storage_layer');

module.exports = {
  Database: require('./Database'),
  PasswordResetRequests: require('./PasswordResetRequests'),
  Sessions: require('./Sessions'),
  Size: require('./Size'),
  Users: User,
  Versions: require('./Versions'),
  user: {
    Accesses: Access,
    EventFiles: require('./user/EventFiles'),
    Events: require('./user/Events'),
    FollowedSlices: require('./user/FollowedSlices'),
    Profile: require('./user/Profile'),
    Streams: Stream,
    Webhooks: require('./user/Webhooks'),
  }, 
  
  StorageLayer: StorageLayer,
};

import type { IndexDefinition } from './Database';
export type { IndexDefinition };

export type {  
  Access, User, Stream };
