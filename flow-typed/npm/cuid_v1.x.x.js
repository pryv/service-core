/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// flow-typed signature: a82d27da752c6fdd180e9e3b5ee92d7f
// flow-typed version: c6154227d1/cuid_v1.x.x/flow_>=v0.104.x

declare module "cuid" {
  declare type cuid = {
    slug: () => string,
    fingerprint: () => string,
    ...
  } & (() => string);

  declare module.exports: cuid;
}
