/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
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
