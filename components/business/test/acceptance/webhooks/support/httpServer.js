const express = require('express');
const bodyParser = require('body-parser');
const EventEmitter = require('events');
const PORT = 6123;

class HttpServer extends EventEmitter {

  app;
  server;
  message;
  messageReceived;

  constructor(path, statusCode, responseBody) {
    super();
    const app = express();

    this.messageReceived = false;

    const that = this;
    app.use(bodyParser.json());
    app.post(path, (req, res) => {
      that.message = req.body;
      that.messageReceived = true;
      this.emit('received');
      res.status(statusCode || 200)
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

  close() {
    return this.server.close(); 
  }
}
module.exports = HttpServer;

