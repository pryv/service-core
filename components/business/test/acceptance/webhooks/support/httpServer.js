const express = require('express');
const bodyParser = require('body-parser');
const EventEmitter = require('events');
const bluebird = require('bluebird');
const PORT = 6123;

class HttpServer extends EventEmitter {

  app;
  server;
  message;
  messageReceived;
  status;

  constructor(path, statusCode, responseBody) {
    super();
    const app = express();

    this.messageReceived = false;
    this.status = statusCode || 200;

    const that = this;
    app.use(bodyParser.json());
    app.post(path, (req, res) => {
      that.message = req.body;
      that.messageReceived = true;
      this.emit('received');
      res.status(that.status)
        .json(responseBody || { ok: '1'});
    });

    this.app = app;
  }

  async listen(port) {
    this.server = await this.app.listen(port || PORT);
  }

  getMessage() {
    return this.message;
  }

  isMessageReceived() {
    return this.messageReceived;
  }

  setResponseStatus(newStatus) {
    this.status = newStatus;
  }

  close() {
    return bluebird.fromCallback(
      (cb) => { this.server.close(cb); });
  }
}
module.exports = HttpServer;

