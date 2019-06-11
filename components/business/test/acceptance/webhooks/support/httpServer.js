// @flow

const express = require('express');
const bodyParser = require('body-parser');
const EventEmitter = require('events');
const bluebird = require('bluebird');
const PORT = 6123;

class HttpServer extends EventEmitter {

  app: Express$app;
  server: HttpServer;
  messages: Array<string>;
  messageReceived: boolean;
  messageCount: number;
  responseStatus: number;

  constructor(path, statusCode, responseBody) {
    super();
    const app = express();

    this.messages = [];
    this.messageReceived = false;
    this.messageCount = 0;
    this.responseStatus = statusCode || 200;

    const that = this;
    app.use(bodyParser.json());
    app.post(path, (req, res) => {
      that.messages = that.messages.concat(req.body.messages);
      that.messageReceived = true;
      that.messageCount++;
      this.emit('received');
      res.status(that.responseStatus)
        .json(responseBody || { ok: '1'});
    });

    this.app = app;
  }

  async listen(port) {
    this.server = await this.app.listen(port || PORT);
  }

  getMessages() {
    return this.messages;
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

  setResponseStatus(newStatus) {
    this.responseStatus = newStatus;
  }

  close() {
    return bluebird.fromCallback(
      (cb) => { this.server.close(cb); });
  }
}
module.exports = HttpServer;

