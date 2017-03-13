/*global describe, before, it */

var helpers = require('./helpers'),
    server = helpers.dependencies.instanceManager,
    request = require('superagent'),
    url = require('url');

describe('(index)', function () {

  function path() {
    return url.resolve(server.url, '/');
  }

  before(server.ensureStarted.bind(server, helpers.dependencies.settings));

  describe('All requests:', function () {

    // more refactoring necessary for this one...
    it('should return correct common HTTP headers (CORS, server time, version)');

    it('should properly translate the Host header\'s username (i.e. subdomain)', function (done) {
      var testData = helpers.data,
          user = testData.users[0];
      request.get(path() + 'events/' + testData.events[2].id + '?auth=' +
              testData.accesses[1].token)
          .set('Host', user.username + '.pryv.local')
          .end(function (err, res) {
        res.statusCode.should.eql(200);
        done();
      });
    });

  });

  describe('OPTIONS /', function () {

    it('should return OK', function (done) {
      request.options(path()).end(function (err, res) {
        res.statusCode.should.eql(200);
        done();
      });
    });

  });

});
