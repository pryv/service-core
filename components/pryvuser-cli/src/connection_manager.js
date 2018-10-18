// @flow

import type Configuration from './configuration';

export class MongoDBConnection { }
export class InfluxDBConnection { }
export class RegistryConnection { }

class ConnectionManager {
  constructor(config: Configuration) {
    config;
  }

  mongoDbConnection(): Promise<MongoDBConnection> {
    throw new Error('Not Implemented');
  }

  influxDbConnection(): Promise<InfluxDBConnection> {
    throw new Error('Not Implemented');
  }

  registryConnection(): Promise<RegistryConnection> {
    throw new Error('Not Implemented');
  }
}

module.exports = ConnectionManager;

