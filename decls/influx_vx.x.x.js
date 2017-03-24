declare module 'influx' {
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
  
  declare class InfluxDB {
    constructor(options?: ISingleHostConfig): void; 
    createDatabase(name: string): Promise<*>;
    writeMeasurement(
      measurement: string, 
      points: Array<IPoint>, 
      options?: IWriteOptions): Promise<void>;
    query(query: string, options?: IQueryOptions): Promise<IResult>; 
    query(query: Array<string>, options?: IQueryOptions): Promise<Array<IResult>>;
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

  declare module.exports: {
    InfluxDB: typeof InfluxDB, // `Router` property on the function
    Expression: typeof Expression,
    escape: {
      stringLit: (s: string) => string, 
    }
  };
}

