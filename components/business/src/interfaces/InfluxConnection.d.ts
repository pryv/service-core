/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

interface IPoint {
  measurement?: string;
  tags?: Record<string, string>;
  fields: Record<string, any>;
  timestamp?: string | number | Date;
}

interface IWriteOptions {
  database?: string;
  precision?: string;
  retentionPolicy?: string;
}

interface IQueryOptions {
  database?: string;
  precision?: string;
}

interface MeasurementData {
  measurement: string;
  points: Array<Record<string, any>>;
}

interface DatabaseExport {
  measurements: MeasurementData[];
}

/**
 * InfluxConnection interface — swappable boundary for time-series storage.
 * Promise-based API.
 */
export interface InfluxConnection {
  createDatabase(name: string): Promise<any>;
  dropDatabase(name: string): Promise<void>;
  dropMeasurement(name: string, dbName: string): Promise<void>;
  writeMeasurement(name: string, points: IPoint[], options?: IWriteOptions): Promise<void>;
  writePoints(points: IPoint[], options?: IWriteOptions): Promise<void>;
  query(query: string, options?: IQueryOptions): Promise<any>;
  getDatabases(): Promise<string[]>;

  // Migration methods
  exportDatabase(name: string): Promise<DatabaseExport>;
  importDatabase(name: string, data: DatabaseExport): Promise<void>;
}

export declare function validateInfluxConnection(instance: any): InfluxConnection;

export declare const REQUIRED_METHODS: string[];
