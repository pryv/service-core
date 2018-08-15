// flow-typed signature: b1b77133dc7009659365009ba9392af3
// flow-typed version: <<STUB>>/unix-timestamp_v0.2.0/flow_v0.71.0

declare module 'unix-timestamp' {
  declare module.exports: {
    now(offset ?: string): number,
    fromDate(date: Date | string): number,
    duration(delta?: string): number,
  };
}
