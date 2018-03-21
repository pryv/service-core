
// @flow

// Partial, in-house flow declarations for protobufjs. 

declare class protobufjs$DefinitionRoot {
  toJSON(): Object; 
}


declare module 'protobufjs' {
  declare type Callback<T> = (err: Error, val: T) => mixed;
    
  declare module.exports: {
    load: (path: string, Callback<protobufjs$DefinitionRoot>) => mixed; 
  }
}