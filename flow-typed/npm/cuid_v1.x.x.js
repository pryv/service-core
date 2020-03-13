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
