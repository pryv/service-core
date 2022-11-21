// NOTE Declaration is made here because the dynamic declaration of methods
// cannot be inferred by the checker.
declare class helpersrequest$Request {
  serverURL: string;
  token: string;
  get(path: string, token: string): any;
  post(path: string, token: string): any;
  put(path: string, token: string): any;
  del(path: string, token: string): any;
  options(path: string, token: string): any;
}

declare module 'request' {
  type Request = helpersrequest$Request;

  let __exports: {
    (serverURL: string): Request;
  };

  export = __exports;
}
