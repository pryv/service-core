declare class http$Server extends net$Socket {
  listen(port: number, hostname?: string, backlog?: number, callback?: Function): http$Server;
  listen(path: string, callback?: Function): http$Server;
  listen(handle: Object, callback?: Function): http$Server;
  close(callback?: (error: ?Error) => mixed): http$Server;
  maxHeadersCount: number;
  setTimeout(msecs: number, callback: () => void): http$Server;
  timeout: number;
}
