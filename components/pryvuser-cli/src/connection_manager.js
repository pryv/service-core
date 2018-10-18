// @flow

import type Configuration from './configuration';

import type { MongoDbSettings, InfluxDbSettings, RegisterSettings } from './configuration';

class MongoDB { 
  constructor(config: MongoDbSettings) {
    config; 
  }
}

class InfluxDB { 
  constructor(config: InfluxDbSettings) {
    config;
  }
}
class Registry { 
  constructor(config: RegisterSettings) {
    config;
  }
}

// Since the 'export' keyword now triggers es6 module loader autodetection and 
// cannot be used anymore to declare a class type and export it at the same 
// time, we'll use this hack for now: 
export type MongoDBConnection = MongoDB; 
export type InfluxDBConnection = InfluxDB; 
export type RegistryConnection = Registry; 

class ConnectionManager {
  config: Configuration;
  
  mongoDbConn: MongoDB;
  influxDbConn: InfluxDB;
  registerConn: Registry;

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

  async influxDbConnection(): Promise<InfluxDBConnection> {
    if (this.influxDbConn != null) return this.influxDbConn;

    const config = this.config;
    const conn = new InfluxDB(config.influxDbSettings());

    this.influxDbConn = conn;

    return conn;
  }

  async registryConnection(): Promise<RegistryConnection> {
    if (this.registerConn != null) return this.registerConn;

    const config = this.config;
    const conn = new Registry(config.registerSettings());

    this.registerConn = conn;

    return conn;
  }
}

module.exports = ConnectionManager;
