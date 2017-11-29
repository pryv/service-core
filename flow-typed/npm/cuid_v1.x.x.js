// flow-typed signature: c93efebc057a78c9e0e1b579b7db4f63
// flow-typed version: 51874ab76c/cuid_v1.x.x/flow_>=v0.25.x

declare module "cuid" {
  declare type cuid = {
    slug: () => string,
    fingerprint: () => string
  } & (() => string);

  declare module.exports: cuid;
}
