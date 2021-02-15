/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// Augment express$Response with the following: 
// 
// * cookie with an Object as 2nd param: enabled by middleware
///
declare class express$Response extends http$ServerResponse mixins express$RequestResponseBase {
  headersSent: boolean;
  locals: {[name: string]: mixed};
  append(field: string, value?: string): this;
  attachment(filename?: string): this;
  cookie(name: string, value: string | Object, options?: express$CookieOptions): this;
  clearCookie(name: string, options?: express$CookieOptions): this;
  download(path: string, filename?: string, callback?: (err?: ?Error) => void): this;
  format(typesObject: {[type: string]: Function}): this;
  json(body?: mixed): this;
  jsonp(body?: mixed): this;
  links(links: {[name: string]: string}): this;
  location(path: string): this;
  redirect(url: string, ...args: Array<void>): this;
  redirect(status: number, url: string, ...args: Array<void>): this;
  render(view: string, locals?: {[name: string]: mixed}, callback?: express$RenderCallback): this;
  send(body?: mixed): this;
  sendFile(path: string, options?: express$SendFileOptions, callback?: (err?: ?Error) => mixed): this;
  sendStatus(statusCode: number): this;
  header(field: string, value?: string): this;
  header(headers: {[name: string]: string}): this;
  set(field: string, value?: string | string[]): this;
  set(headers: {[name: string]: string}): this;
  status(statusCode: number): this;
  type(type: string): this;
  vary(field: string): this;
  req: express$Request;
}

// Augment express$Request with the following: 
//
// * files property, because we decode files and store them there on input (multer)
//
declare class express$Request extends http$IncomingMessage mixins express$RequestResponseBase {
  baseUrl: string;
  body: any;
  cookies: {[cookie: string]: string};
  connection: Socket;
  context: Object;
  fresh: boolean;
  hostname: string;
  ip: string;
  ips: Array<string>;
  method: string;
  originalUrl: string;
  params: express$RequestParams;
  path: string;
  protocol: 'https' | 'http';
  query: {[name: string]: string | Array<string>};
  route: string;
  secure: boolean;
  signedCookies: {[signedCookie: string]: string};
  stale: boolean;
  subdomains: Array<string>;
  xhr: boolean;
  files: mixed;
  accepts(types: string): string | false;
  accepts(types: Array<string>): string | false;
  acceptsCharsets(...charsets: Array<string>): string | false;
  acceptsEncodings(...encoding: Array<string>): string | false;
  acceptsLanguages(...lang: Array<string>): string | false;
  header(field: string): string | void;
  is(type: string): boolean;
  param(name: string, defaultValue?: string): string | void;
}
