// @flow

import type Configuration from './configuration';

class MongoDB { }
class InfluxDB { }
class Registry { }

// Since the 'export' keyword now triggers es6 module loader autodetection and 
// cannot be used anymore to declare a class type and export it at the same 
// time, we'll use this hack for now: 
export type MongoDBConnection = MongoDB; 
export type InfluxDBConnection = InfluxDB; 
export type RegistryConnection = Registry; 

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
