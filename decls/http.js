/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
declare class http$Server extends net$Socket {
  listen(port: number, hostname?: string, backlog?: number, callback?: Function): http$Server;
  listen(path: string, callback?: Function): http$Server;
  listen(handle: Object, callback?: Function): http$Server;
  close(callback?: (error: ?Error) => mixed): http$Server;
  maxHeadersCount: number;
  setTimeout(msecs: number, callback?: () => void): http$Server;
  timeout: number;
}
