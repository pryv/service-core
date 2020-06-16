// @flow

import type Configuration from './configuration';

const MongoDB = require('./connection/mongodb');
const InfluxDB = require('./connection/influxdb');
const FileStore = require('./connection/file_store');
const Registry = require('./connection/registry');

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

    const { config } = this;
    const conn = new MongoDB(await config.mongoDbSettings());

    this.mongoDbConn = conn;

    return conn;
  }

  async influxDbConnection(): Promise<InfluxDB> {
    if (this.influxDbConn != null) return this.influxDbConn;

    const { config } = this;
    const conn = new InfluxDB(config.influxDbSettings());

    this.influxDbConn = conn;

    return conn;
  }

  async registryConnection(): Promise<Registry> {
    if (this.registerConn != null) return this.registerConn;

    const { config } = this;
    const conn = new Registry(await config.registrySettings());

    this.registerConn = conn;

    return conn;
  }

  async fileStoreConnection(): Promise<FileStore> {
    if (this.fileStore != null) return this.fileStore;

    const { config } = this;
    const mongodb = await this.mongoDbConnection();
    const conn = new FileStore(await config.fileStoreSettings(), mongodb);

    this.fileStore = conn;

    return conn;
  }
}

module.exports = ConnectionManager;
