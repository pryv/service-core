// @flow

import type Configuration from './configuration';

import type { MongoDbSettings } from './configuration';

class MongoDB { 
  constructor(config: MongoDbSettings) {
    config; 
  }
}

class InfluxDB { }
class Registry { }

// Since the 'export' keyword now triggers es6 module loader autodetection and 
// cannot be used anymore to declare a class type and export it at the same 
// time, we'll use this hack for now: 
export type MongoDBConnection = MongoDB; 
export type InfluxDBConnection = InfluxDB; 
export type RegistryConnection = Registry; 

class ConnectionManager {
  config: Configuration;
  
  mongoDbConn: MongoDB;

  constructor(config: Configuration) {
    this.config = config; 
  }

  async mongoDbConnection(): Promise<MongoDBConnection> {
    if (this.mongoDbConn != null) return this.mongoDbConn;

    const config = this.config; 
    const conn = new MongoDB(config.mongoDbSettings());

    this.mongoDbConn = conn; 

    return conn;
  }

  influxDbConnection(): Promise<InfluxDBConnection> {
    throw new Error('Not Implemented');
  }

  registryConnection(): Promise<RegistryConnection> {
    throw new Error('Not Implemented');
  }
}

module.exports = ConnectionManager;
