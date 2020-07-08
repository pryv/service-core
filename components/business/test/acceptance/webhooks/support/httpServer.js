/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const express = require('express');
const bodyParser = require('body-parser');
const EventEmitter = require('events');
const bluebird = require('bluebird');
const PORT = 6123;

class HttpServer extends EventEmitter {

  app: express$Application;
  server: ?HttpServer;
  messages: Array<string>;
  metas: Array<string>;
  messageReceived: boolean;
  messageCount: number;
  responseStatus: number;
  responseDelay: ?number;

  constructor(path: string, statusCode: number, responseBody: {}, delay: number) {
    super();
    const app = express();

    this.messages = [];
    this.metas = [];
    this.messageReceived = false;
    this.messageCount = 0;
    this.responseStatus = statusCode || 200;
    this.responseDelay = delay || null;

    const that = this;
    app.use(bodyParser.json());
    app.post(path, (req: express$Request, res: express$Response) => {

      this.emit('received');
      if (that.responseDelay == null) {
        processMessage.call(that, req, res);
      } else {
        setTimeout(() => {
          processMessage.call(that, req, res);
        }, that.responseDelay);
      }
    });

    function processMessage(req, res) {
      this.messages = this.messages.concat(req.body.messages);
      this.metas = this.metas.concat(req.body.meta);
      this.messageReceived = true;
      this.messageCount++;
      this.emit('responding');
      res.status(this.responseStatus)
        .json(responseBody || { ok: '1'});
    }

    this.app = app;
  }

  async listen(port: number) {
    this.server = await this.app.listen(port || PORT);
  }

  getMessages() {
    return this.messages;
  }

  getMetas() {
    return this.metas;
  }

  isMessageReceived() {
    return this.messageReceived;
  }

  resetMessageReceived() {
    this.messageReceived = false;
  }

  getMessageCount() {
    return this.messageCount;
  }

  setResponseStatus(newStatus: number) {
    this.responseStatus = newStatus;
  }

  setResponseDelay(delay: number) {
    this.responseDelay = delay;
  }

  close() {
    return bluebird.fromCallback(
      (cb) => { 
        if (this.server == null) return cb();
        this.server.close(cb); 
      });
  }
}
module.exports = HttpServer;

