/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// flow-typed signature: 8b21843f43134917177d82a3b993b609
// flow-typed version: c6154227d1/rimraf_v2.x.x/flow_>=v0.104.x

declare module 'rimraf' {
  declare type Options = {
    maxBusyTries?: number,
    emfileWait?: number,
    glob?: boolean,
    disableGlob?: boolean,
    ...
  };
  
  declare type Callback = (err: ?Error, path: ?string) => void;

  declare module.exports: {
    (f: string, opts?: Options | Callback, callback?: Callback): void,
    sync(path: string, opts?: Options): void,
    ...
  };
}
