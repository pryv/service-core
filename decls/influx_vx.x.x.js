declare module 'influx' {
  declare class InfluxDB {
    ensureDatabase(name: string): Promise<*>;
  }
}

