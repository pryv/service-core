/*global describe, before, it */

var helpers = require('./helpers'),
    server = helpers.dependencies.instanceManager,
    request = require('superagent'),
    url = require('url');

describe('(index)', function () {

  function path(a) {
    return url.resolve(server.url, a || '/');
  }

  before(server.ensureStarted.bind(server, helpers.dependencies.settings));

  describe('OPTIONS /', function () {
    it('[E5MW] should return OK', function (done) {
      request.options(path()).end(function (err, res) {
        res.statusCode.should.eql(200);
        done();
      });
    });

  });

});
