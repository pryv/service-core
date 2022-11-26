/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// TODO remove this (use a single mocking tool if possible)

const EventEmitter = require('events');
const bluebird = require('bluebird');
const express = require('express');
const bodyParser = require('body-parser');
const PORT = 6123;
/*
 * Create a local HTTP server for the purpose of answering
 * query on localhost:PORT/service/info or localhost:PORT/reports
 * mocking https://reg.pryv.me/service/info
 *
 * No logger available here. Using console.debug
 */
/** @extends EventEmitter */
class HttpServer extends EventEmitter {
  app;

  server;

  responseStatus;

  lastReport;
  constructor (path, statusCode, responseBody) {
    super();
    const app = express();
    this.responseStatus = statusCode || 200;
    app.use(bodyParser.json());
    app.all(path, (req, res) => {
      res.status(this.responseStatus).json(responseBody || { ok: '1' });
      if (req.method === 'POST') {
        this.lastReport = req.body;
        this.emit('report_received');
      }
    });
    this.app = app;
  }

  /**
 * @param {number} port
       * @returns {Promise<void>}
       */
  async listen (port) {
    this.server = await this.app.listen(port || PORT);
  }

  /**
 * @returns {any}
 */
  close () {
    return bluebird.fromCallback(() => {
      this.server.close();
    });
  }

  /**
 * @returns {any}
 */
  getLastReport () {
    return this.lastReport;
  }
}
module.exports = HttpServer;
