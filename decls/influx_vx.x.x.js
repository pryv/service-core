declare type ISingleHostConfig = {
  username?: string,
  password?: string, 
  database?: string, 
  host?: string, 
  port?: number, 
  protocol?: string, 
  // Some missing here, see
  // https://node-influx.github.io/typedef/index.html#static-typedef-IWriteOptions
}
  
declare class Expression {
  field(name: string): Expression; 
  gte(): Expression; 
  lt(): Expression; 
  // TODO replace this with getter/setter once flowtype supports it.
  and: Expression; 
  or: Expression;
  equals: Expression; 
  value(value: any): Expression; 
}

declare type IResults = {
  time?: INanoDate, 
  [key: string]: any, 
}

declare type INanoDate = {
  getNanoTime(): string; 
  toNanoISOString(): string; 
}

declare type IPoint = {
  measurement: string, 
  tags?: {[key: string]: string}, 
  fields?: {[name: string]: Object},
  timestamp?: (Date | string | number)
}

declare type IWriteOptions = {
  precision?: TimePrecision, 
  retentionPolicy?: string, 
  database?: string,
}

declare type IQueryOptions = {
  precision?: TimePrecision, 
  retentionPolicy?: string, 
  database?: string,
}

declare type TimePrecision = 'h' | 'm' | 's' | 'ms' | 'u' | 'ns';

declare module 'influx' {
  declare type InfluxDB = InfluxDB;
  declare type ISingleHostConfig = ISingleHostConfig;
  declare type IResults = IResults;
  declare type IPoint = IPoint;
  declare type IWriteOptions = IWriteOptions;
  declare type IQueryOptions = IQueryOptions;
  
  declare module.exports: {
    InfluxDB: InfluxDB, // `Router` property on the function
    Expression: typeof Expression,
  }
}

