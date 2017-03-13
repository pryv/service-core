'use strict';
// @flow

const superagent = require('superagent');
const url = require('url');
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
    const destUrl = url.resolve(this.serverURL, path);
    const authToken = token || this.token; 
    
    return new IndifferentRequest(method, destUrl, authToken);
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
  .send(authData).end(function (err, res) {
    should(res).not.be.empty(); 
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
 * A superagent request that only ever calls back with a single argument.  The
 * argument will be the response object, regardless of the error status of  the
 * query. 
 * 
 * NOTE This is not a good idea, but most of our tests assume this behaviour
 *      because things used to be this way. Important right now, deprected as 
 *      well. 
 */ 
class IndifferentRequest extends superagent.Request {
  
  /** Construct a request. 
   * 
   * @see superagent.Request
   *    
   * @param  {string} method HTTP Method to use for this request
   * @param  {string|url.Url} url request url
   * @param  {string} token authentication token to use
   */   
  constructor(method: string, url, token) {
    super(method, url)
      .set('authorization', token);
  }
  
  end(callback: (res: any) => void) {
    super.end((err, res) => {
      callback(res || err);
    });
  } 
}

/**
 * Expose the patched superagent for tests that don't need the wrapper.
 */
request.superagent = superagent;
