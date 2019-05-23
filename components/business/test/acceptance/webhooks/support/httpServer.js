const express = require('express');
const bodyParser = require('body-parser');
const PORT = 6123;

class HttpServer {

  app;
  server;
  message;

  constructor(path, statusCode, responseBody) {
    const app = express();

    const that = this;
    app.use(bodyParser.json());
    app.post(path, (req, res) => {
      that.message = req.body;
      res.status(statusCode || 200)
        .json(responseBody || { ok: '1'});
    });

    this.app = app;
  }

  listen(done) {
    this.server = this.app.listen(PORT, () => { 
      done(); 
    });
  }

  getMessage() {
    return this.message;
  }

  close() {
    return this.server.close(); 
  }
}
module.exports = HttpServer;

