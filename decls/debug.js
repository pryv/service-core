/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// @flow

declare module 'debug' {
  declare type DebugFn = (...args: Array<mixed>) => void;
  
  declare module.exports: (string) => DebugFn;
}