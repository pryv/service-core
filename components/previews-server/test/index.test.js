/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

const helpers = require('./helpers');
const server = helpers.dependencies.instanceManager;
const request = require('superagent');

describe('(index)', function () {
  function path (a) {
    return new URL(a || '/', server.url).toString();
  }

  before(server.ensureStarted.bind(server, helpers.dependencies.settings));

  describe('OPTIONS /', function () {
    it('[E5MW] should return OK', async function () {
      const res = await request.options(path());
      res.statusCode.should.eql(200);
    });
  });
});
