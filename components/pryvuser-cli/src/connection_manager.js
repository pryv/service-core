// @flow

import type Configuration from './configuration';

import type { 
  MongoDbSettings, InfluxDbSettings, RegisterSettings,
  FileStoreSettings } 
  from './configuration';

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
class InfluxDB { 
  constructor(config: InfluxDbSettings) {
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
class Registry { 
  constructor(config: RegisterSettings) {
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
class FileStore { 
  constructor(config: FileStoreSettings) {
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


class ConnectionManager {
  config: Configuration;
  
  mongoDbConn: ?MongoDB;
  influxDbConn: ?InfluxDB;
  registerConn: ?Registry;
  fileStore: ?FileStore;

  constructor(config: Configuration) {
    this.config = config; 
  }

  async mongoDbConnection(): Promise<MongoDB> {
    if (this.mongoDbConn != null) return this.mongoDbConn;

    const config = this.config; 
    const conn = new MongoDB(config.mongoDbSettings());

    this.mongoDbConn = conn; 

    return conn;
  }

  async influxDbConnection(): Promise<InfluxDB> {
    if (this.influxDbConn != null) return this.influxDbConn;

    const config = this.config;
    const conn = new InfluxDB(config.influxDbSettings());

    this.influxDbConn = conn;

    return conn;
  }

  async registryConnection(): Promise<Registry> {
    if (this.registerConn != null) return this.registerConn;

    const config = this.config;
    const conn = new Registry(config.registerSettings());

    this.registerConn = conn;

    return conn;
  }

  async fileStoreConnection(): Promise<FileStore> {
    if (this.fileStore != null) return this.fileStore;

    const config = this.config;
    const conn = new FileStore(config.fileStoreSettings());

    this.fileStore = conn;

    return conn;
  }
}

module.exports = ConnectionManager;
