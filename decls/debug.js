
// @flow

declare module 'debug' {
  declare type DebugFn = (...args: Array<mixed>) => void;
  
  declare module.exports: (string) => DebugFn;
}