/* eslint-disable no-console */
// @flow
const bluebird = require('bluebird');
const express = require('express');
const bodyParser = require('body-parser');

const PORT = 6123;

/*
 * Create a local HTTP server for the purpose of answering
 * query on localhost:PORT/service/info
 * mocking https://reg.pryv.me/service/info
 *
 * No logger available here. Using console.debug
 */
class HttpServer {
  app: express$Application;
  server: HttpServer;
  responseStatus: number;

  constructor (path: string, statusCode: number, responseBody: Object) {
    const app = express();

    this.responseStatus = statusCode || 200;

    app.use(bodyParser.json());
    app.get(path, (req, res: express$Response) => {
      res.status(this.responseStatus).json(responseBody || { ok: '1' });
    });
    this.app = app;
  }

  async listen (port: number) {
    this.server = await this.app.listen(port || PORT);
  }

  close () {
    return bluebird.fromCallback(() => {
      this.server.close();
    });
  }
}
module.exports = HttpServer;
