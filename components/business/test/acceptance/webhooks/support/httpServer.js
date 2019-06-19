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
  responseDelay: number;

  constructor(path, statusCode, responseBody, delay) {
    super();
    const app = express();

    this.messages = [];
    this.messageReceived = false;
    this.messageCount = 0;
    this.responseStatus = statusCode || 200;
    this.responseDelay = delay || null;

    const that = this;
    app.use(bodyParser.json());
    app.post(path, (req, res) => {

      this.emit('received');
      console.log('received with delay?', that.responseDelay);
      if (that.responseDelay == null) {
        processMessage.call(that, req, res);
      } else {
        setTimeout(() => {
          console.log('WHY YOU NOT WAIT')
          processMessage.call(that, req, res);
        }, that.responseDelay);
      }
      
    });

    function processMessage(req, res) {
      this.messages = this.messages.concat(req.body.messages);
      this.messageReceived = true;
      this.messageCount++;
      this.emit('responding');
      res.status(this.responseStatus)
        .json(responseBody || { ok: '1'});
    }

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

  setResponseDelay(delay) {
    console.log('delay set', delay)
    this.responseDelay = delay;
  }

  close() {
    return bluebird.fromCallback(
      (cb) => { this.server.close(cb); });
  }
}
module.exports = HttpServer;

