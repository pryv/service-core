/* global describe, before, it */

const helpers = require('./helpers');

const server = helpers.dependencies.instanceManager;
const request = require('superagent');
const url = require('url');

describe('(index)', () => {
  function path(a) {
    return url.resolve(server.url, a || '/');
  }

  before(server.ensureStarted.bind(server, helpers.dependencies.settings));

  describe('OPTIONS /', () => {
    it('[E5MW] should return OK', (done) => {
      request.options(path()).end((err, res) => {
        res.statusCode.should.eql(200);
        done();
      });
    });
  });
});
