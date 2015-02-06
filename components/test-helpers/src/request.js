var superagent = require('superagent'),
    url = require('url');

/**
 * Helper for HTTP requests (with access token authentication).
 */
module.exports = function (serverURL) {
  return new Request(serverURL);
};

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
    /[^A-Za-z0-9\-_.!~*'()%]/.test(res.body.token).should.eql(false,
        'Token must be URI-encoded');
    this.token = res.body.token;

    callback();
  }.bind(this));
};


/**
 * HACK: monkeypatch superagent to allow removing automatically set headers.
 * Must be called after send().
 */
superagent.Request.prototype.unset = function (field) {
  this.request().removeHeader(field);
  return this;
};
