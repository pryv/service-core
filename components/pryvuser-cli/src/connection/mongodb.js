// @flow

import type { MongoDbSettings } from '../configuration';

class MongoDB {
  constructor(config: MongoDbSettings) {
    config;
  }

  preflight(username: string): Promise<void> {
    username;
    throw new Error('Not Implemented');
  }
  deleteUser(username: string): Promise<void> {
    username;
    throw new Error('Not Implemented');
  }
}

module.exports = MongoDB;