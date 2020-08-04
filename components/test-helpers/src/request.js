/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const superagent = require('superagent');
const url = require('url');
const should = require('should');
const assert = require('chai').assert;

/**
 * Helper for HTTP requests (with access token authentication).
 */
module.exports = request;
module.exports.unpatched = unpatchedRequest; 


// --------------------------------- new usage, unpatched sa with helpers added
function unpatchedRequest(serverURL: string): UnpatchedRequest {
  return new UnpatchedRequest(serverURL); 
}

class UnpatchedRequest {
  serverURL: string; 
  token: ?string; 
  
  constructor(serverURL: string) {
    this.serverURL = serverURL;
    this.token = null; 
  }
  
  get(...args) {
    return this.execute('GET', ...args);
  }
  
  execute(method: string, path: string, token?: string) {
    const authToken = token || this.token; 
    const destUrl = url.resolve(this.serverURL, path);

    return new superagent.Request(method, destUrl)
      .set('authorization', authToken);
  }
}

// -------------------------------------------------------- deprecated old usage
function request(serverURL: string) {
  return new Request(serverURL);
}

function Request(serverURL) {
  this.serverURL = serverURL;
  this.token = null;
}

var methods = ['get', 'post', 'put', 'del', 'options'];
methods.forEach(function (method) {
  Request.prototype[method] = function (path: any, token: any) {
    const destUrl = url.resolve(this.serverURL, path);
    const authToken = token || this.token; 
    
    return new IndifferentRequest(method, destUrl, authToken);
  };
});

/**
 * @param {Function} callback (error)
 */
Request.prototype.login = function (user: any, callback: any) {
  var targetURL = url.resolve(this.serverURL, user.username + '/auth/login');
  var authData = {
    username: user.username,
    password: user.password,
    appId: 'pryv-test'
  }; 
 
  return superagent.post(targetURL)
    .set('Origin', 'http://test.pryv.local')
    .send(authData).end(function (err, res) {
      // TODO IEVA
      if (err) {
        console.log(authData, 'authData', user, 'user');
        console.log(err.response.error, 'err Request.prototype.login', authData);
      }
      assert.isNull(err, 'Request must be a success');
      assert.isDefined(res, 'Request has a result');
      res.statusCode.should.eql(200);

      if (res.body.token == null) {
        return callback(new Error('Expected "token" in login response body.'));
      }

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
 *      because things used to be this way. Important right now, deprecated as 
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
  constructor(method: string, url: string, token: string) {
    // NOTE newer superagent versions don't know about delete; Let's pretend 
    // we do. 
    if (method === 'del') method = 'delete';

    super(method, url)
      .set('authorization', token);
  }
  
  end(callback: (res: any) => void) {
    super.end((err, res) => {
      callback(res || err);
    });
  } 
}

