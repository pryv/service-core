'use strict';
// @flow

var superagent = require('superagent'),
    url = require('url');
const should = require('should');

/**
 * Helper for HTTP requests (with access token authentication).
 */
module.exports = request;
function request(serverURL: string) {
  return new Request(serverURL);
}

function Request(serverURL) {
  this.serverURL = serverURL;
  this.token = null;
}

var methods = ['get', 'post', 'put', 'del', 'options'];
methods.forEach(function (method) {
  Request.prototype[method] = function (path, token) {
    return superagent[method](url.resolve(this.serverURL, path))
        .set('authorization', token || this.token);
  };
});

/**
 * @param {Function} callback (error)
 */
Request.prototype.login = function (user, callback) {
  var targetURL = url.resolve(this.serverURL, user.username + '/auth/login');
  var authData = {
    username: user.username,
    password: user.password,
    appId: 'pryv-test'
  };
  return superagent.post(targetURL)
  .set('Origin', 'http://test.pryv.local')
  .send(authData).end(function (res) {
    res.statusCode.should.eql(200);

    if (! res.body.token) {
      return callback(new Error('Expected "token" in login response body.'));
    }
    should(
      /[^A-Za-z0-9\-_.!~*'()%]/.test(res.body.token)
    ).be.false('Token must be URI-encoded');
    this.token = res.body.token;

    callback();
  }.bind(this));
};

/**
 * HACK: work around change in superagent lib to handle all non 2XX responses as errors.
 * Easier for tests to keep old behaviour of always returning just a response with HTTP code.
 */
var originalEnd = superagent.Request.prototype.end;
superagent.Request.prototype.end = function (callback) {
  return originalEnd.call(this, function (err, res) {
    callback(res);
  });
};

/**
 * Expose the patched superagent for tests that don't need the wrapper.
 */
request.superagent = superagent;
