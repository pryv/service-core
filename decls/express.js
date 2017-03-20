declare class express$Request extends http$IncomingMessage mixins express$RequestResponseBase {
  baseUrl: string;
  body: mixed;
  cookies: {[cookie: string]: string};
  fresh: boolean;
  hostname: string;
  ip: string;
  ips: Array<string>;
  method: string;
  originalUrl: string;
  params: {[param: string]: string};
  path: string;
  protocol: 'https' | 'http';
  query: {[name: string]: string};
  route: string;
  secure: boolean;
  signedCookies: {[signedCookie: string]: string | Object};
  stale: boolean;
  subdomains: Array<string>;
  xhr: boolean;
  accepts(types: string): string | false;
  acceptsCharsets(...charsets: Array<string>): string | false;
  acceptsEncodings(...encoding: Array<string>): string | false;
  acceptsLanguages(...lang: Array<string>): string | false;
  header(field: string): string | void;
  is(type: string): boolean;
  param(name: string, defaultValue?: string): string | void;
}

declare class express$Response extends http$ServerResponse mixins express$RequestResponseBase {
  headersSent: boolean;
  locals: {[name: string]: mixed};
  append(field: string, value?: string): this;
  attachment(filename?: string): this;
  cookie(name: string, value: string, options?: express$CookieOptions): this;
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
  set(field: string, value?: string): this;
  set(headers: {[name: string]: string}): this;
  status(statusCode: number): this;
  type(type: string): this;
  vary(field: string): this;

  cookie(name: string, value: Object, options?: express$CookieOptions): this;
}

