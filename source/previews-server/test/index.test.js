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

  describe('All requests:', function () {

    it('should properly translate the Host header\'s username (i.e. subdomain)', function (done) {
      var testData = helpers.data,
          user = testData.users[0];
          
      const eventId = testData.events[2].id;
      const accessToken = testData.accesses[2].token;
        
      request
        .get(path(`/events/${eventId}?auth=${accessToken}`))
        .set('Host', `${user.username}.pryv.local`)
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
