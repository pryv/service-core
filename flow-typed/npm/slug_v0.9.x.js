// flow-typed signature: dd5214db11d131883aef1a3baf7b5c43
// flow-typed version: c6154227d1/slug_v0.9.x/flow_>=v0.104.x

type SlugMode = 'rfc3986' | 'pretty'

declare module 'slug' {
  declare type SlugOptions = {
    mode?: SlugMode,
    replacement?: string,
    multicharmap?: { [key: string]: string, ... },
    charmap?: { [key: string]: string, ... },
    remove?: ?RegExp,
    lower?: boolean,
    symbols?: boolean,
    ...
  }
  declare module.exports: {
    (input: string, optionOrReplacement?: string | SlugOptions): string,
    defaults: {
      mode: 'pretty',
      charmap: { [key: string]: string, ... },
      multicharmap: { [key: string]: string, ... },
      modes: { [key: SlugMode]: SlugOptions, ... },
      ...
    },
    ...
  }
}
