/*global describe, before, after, it */

var helpers = require('./helpers'),
    server = helpers.dependencies.instanceManager,
    async = require('async'),
    validation = helpers.validation,
    ErrorIds = require('components/errors').ErrorIds,
//    nock = require('nock'),
//    querystring = require('querystring'),
    should = require('should'), // explicit require to benefit from static functions
    request = require('superagent'),
    testData = helpers.data,
    url = require('url'),
    _ = require('lodash');

describe('auth', function () {

  function basePath(username) {
    return url.resolve(server.url, username + '/auth');
  }

  before(function (done) {
    async.series([
      server.ensureStarted.bind(server, helpers.dependencies.settings),
      testData.resetUsers
    ], done);
  });

  after(function (done) {
    helpers.dependencies.storage.sessions.clearAll(done);
  });

  var user = testData.users[0],
      trustedOrigin = 'http://test.pryv.local';
  var authData = {
    username: user.username,
    password: user.password,
    appId: 'pryv-test'
  };

  describe('/login', function () {

    function path(username) {
      return basePath(username) + '/login';
    }

    before(testData.resetAccesses);

    it('must authenticate the given credentials, open a session and return the access token',
        function (done) {
      async.series([
        function login(stepDone) {
          request.post(path(authData.username))
            .set('Origin', trustedOrigin)
            .send(authData).end(function (res) {
            res.statusCode.should.eql(200);

            should.exist(res.body.token);
            checkNoUnwantedCookie(res);
            should.exist(res.body.preferredLanguage);
            res.body.preferredLanguage.should.eql(user.language);

            stepDone();
          });
        },
        function checkAccess(stepDone) {
          helpers.dependencies.storage.user.accesses.findOne(user, {name: authData.appId}, null,
              function (err, access) {
            access.modifiedBy.should.eql('system');
            stepDone();
          });
        }
      ], done);
    });

    it('must reuse the current session if already open', function (done) {
      var originalToken;
      async.series([
        function login(stepDone) {
          request.post(path(authData.username))
              .set('Origin', trustedOrigin)
              .send(authData).end(function (res) {
            res.statusCode.should.eql(200);
            originalToken = res.body.token;
            stepDone();
          });
        },
        function loginAgain(stepDone) {
          request.post(path(authData.username))
              .set('Origin', trustedOrigin)
              .send(authData).end(function (res) {
            res.statusCode.should.eql(200);
            res.body.token.should.eql(originalToken);
            stepDone();
          });
        }
      ], done);
    });

    it('must accept "wildcarded" app ids and origins', function (done) {
      request.post(path(authData.username))
          .set('Origin', 'https://test.rec.la:1234')
          .send(authData).end(function (res) {
        res.statusCode.should.eql(200);
        done();
      });
    });

    it('must accept "no origin" (i.e. not a CORS request) if authorized', function (done) {
      var authDataNoCORS = _.defaults({appId: 'pryv-test-no-cors'}, authData);
      request.post(path(authDataNoCORS.username))
          .send(authDataNoCORS).end(function (res) {
        res.statusCode.should.eql(200);
        done();
      });
    });

    it('must not be case-sensitive for the username', function (done) {
      request.post(path(authData.username))
          .set('Origin', trustedOrigin)
          .send(_.defaults({username: authData.username.toUpperCase()}, authData))
          .end(function (res) {
        res.statusCode.should.eql(200);
        done();
      });
    });

    it('must return a correct error when the local credentials are missing or invalid',
        function (done) {
      var data = _.defaults({
        username: authData.username,
        password: 'bad-password'
      }, authData);
      request.post(path(data.username))
          .set('Origin', trustedOrigin)
          .send(data).end(function (res) {
        validation.checkError(res, {
          status: 401,
          id: ErrorIds.InvalidCredentials
        });
        should.not.exist(res.body.token);
        done();
      });
    });

    it('must return a correct error if the app id is missing or untrusted', function (done) {
      var data = _.defaults({appId: 'untrusted-app-id'}, authData);
      request.post(path(data.username))
          .set('Origin', trustedOrigin)
          .send(data).end(function (res) {
        validation.checkError(res, {
          status: 401,
          id: ErrorIds.InvalidCredentials
        });
        should.not.exist(res.body.token);
        done();
      });
    });

    it('must return a correct error if the origin is missing or does not match the app id',
        function (done) {
      request.post(path(authData.username))
          .set('Origin', 'http://mismatching.origin')
          .send(authData).end(function (res) {
        validation.checkError(res, {
          status: 401,
          id: ErrorIds.InvalidCredentials
        });
        should.not.exist(res.body.token);
        done();
      });
    });

    function checkNoUnwantedCookie(res) {
      if (! res.headers['set-cookie']) { return; }

      res.headers['set-cookie'].filter(function (cookieString) {
        return cookieString.indexOf('sso=') !== 0; // we only want the SSO cookie
      }).should.eql([]);
    }

  });

  describe('/logout', function () {

    function path(username) {
      return basePath(username) + '/logout';
    }

    it('must terminate the access session', function (done) {
      var token;
      async.series([
          function (stepDone) {
            request.post(basePath(user.username) + '/login')
            .set('Origin', trustedOrigin)
            .send(authData).end(function (res) {
              token = res.body.token;
              stepDone();
            });
          },
          function (stepDone) {
            request.post(path(user.username)).send({})
            .set('authorization', token).end(function (res) {
              res.statusCode.should.eql(200);
              stepDone();
            });
          },
          function (stepDone) {
            request.post(path(user.username)).send({})
            .set('authorization', token).end(function (res) {
              validation.checkError(res, {
                status: 401,
                id: ErrorIds.InvalidAccessToken
              }, stepDone);
            });
          }
        ],
        done
      );
    });

    it('(or any request) must alternatively accept the access token in the query string',
        function (done) {
      var testRequest = helpers.request(server.url);
      async.series([
          testRequest.login.bind(testRequest, user),
          function (stepDone) {
            request.post(path(user.username)).query({auth: testRequest.token}).send({})
            .end(function (res) {
              res.statusCode.should.eql(200);
              stepDone();
            });
          }
        ],
        done
      );
    });

  });

  describe('SSO support', function () {

    // WARNING: exceptionally, tests in here are interdependent and their sequence matters

    var cookie = require('cookie'),
        persistentReq = request.agent(),
        ssoInfo,
        cookieOptions;

    it('must set the SSO cookie on /login with the access token', function (done) {
      persistentReq.post(basePath(authData.username) + '/login')
          .set('Origin', trustedOrigin)
          .send(authData).end(function (res) {
            res.statusCode.should.eql(200);

            var setCookie = res.headers['set-cookie'];
            should.exist(setCookie);
            setCookie.length.should.eql(1);
            var parsed = cookie.parse(setCookie[0]);
            parsed.should.have.property('sso');
            var jsonMatch = /\{.+\}/.exec(parsed.sso);
            should.exist(jsonMatch);
            ssoInfo = {
              username: authData.username,
              token: res.body.token
            };
            JSON.parse(jsonMatch).should.eql(ssoInfo);
            cookieOptions = {
              Domain: parsed.Domain,
              Path: parsed.Path
            };

            done();
          });
    });

    it('must answer /who-am-i with username and session details if session open', function (done) {
      persistentReq.get(basePath(authData.username) + '/who-am-i').end(function (res) {
        validation.check(res, {
          status: 200,
          body: ssoInfo
        }, done);
      });
    });

    it('TODO: must update the SSO cookie expiration date as well when extending the session');

    it('must clear the SSO cookie on /logout', function (done) {
      persistentReq.post(basePath(authData.username) + '/logout').send({})
          .set('authorization', ssoInfo.token)
          .end(function (res) {
        res.statusCode.should.eql(200);

        var setCookie = res.headers['set-cookie'];
        should.exist(setCookie);
        setCookie.length.should.eql(1);
        var parsed = cookie.parse(setCookie[0]);
        parsed.should.have.property('sso');
        parsed.sso.should.eql('');
        parsed.should.have.property('Expires');
        parsed.Domain.should.eql(cookieOptions.Domain);
        parsed.Path.should.eql(cookieOptions.Path);

        done();
      });
    });

    it('must respond /who-am-i with an "unauthorized" error if no cookie is sent', function (done) {
      persistentReq.get(basePath(authData.username) + '/who-am-i').end(function (res) {
        res.statusCode.should.eql(401);
        should.not.exist(res.body.username);
        should.not.exist(res.body.token);
        done();
      });
    });

  });

});
