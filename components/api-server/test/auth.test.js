/*global describe, before, beforeEach, after, it */

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
    _ = require('lodash'),
    fs = require('fs'),
    os = require('os');

describe('auth', function () {

  this.timeout(5000);

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
            .send(authData).end(function (err, res) {
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
              .send(authData).end(function (err, res) {
            res.statusCode.should.eql(200);
            originalToken = res.body.token;
            stepDone();
          });
        },
        function loginAgain(stepDone) {
          request.post(path(authData.username))
              .set('Origin', trustedOrigin)
              .send(authData).end(function (err, res) {
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
          .send(authData).end(function (err, res) {
        res.statusCode.should.eql(200);
        done();
      });
    });

    it('must accept "no origin" (i.e. not a CORS request) if authorized', function (done) {
      var authDataNoCORS = _.defaults({appId: 'pryv-test-no-cors'}, authData);
      request.post(path(authDataNoCORS.username))
          .send(authDataNoCORS).end(function (err, res) {
        res.statusCode.should.eql(200);
        done();
      });
    });

    it('must not be case-sensitive for the username', function (done) {
      request.post(path(authData.username))
          .set('Origin', trustedOrigin)
          .send(_.defaults({username: authData.username.toUpperCase()}, authData))
          .end(function (err, res) {
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
          .send(data).end(function (err, res) {
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
          .send(data).end(function (err, res) {
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
          .send(authData).end(function (err, res) {
        validation.checkError(res, {
          status: 401,
          id: ErrorIds.InvalidCredentials
        });
        should.not.exist(res.body.token);
        done();
      });
    });
    
    it('must support concurrent login request',
        function (done) {          
          var loginCount = 2;
          var randomId = 'pryv-test-' + Date.now();
          
          async.times(loginCount, function (n, next) {
            parallelLogin(randomId, function(err) {
              next(err);
            });
          }, function (error) {
            done(error);
          });
        }
    );

    // cf. GH issue #57
    it('must not leak _private object from Result', function (done) {
      request.post(path(authData.username))
        .set('Origin', trustedOrigin)
        .send(authData).end(function (err, res) {
        res.statusCode.should.eql(200);

        should.exist(res.body.token);
        checkNoUnwantedCookie(res);
        should.exist(res.body.preferredLanguage);
        res.body.preferredLanguage.should.eql(user.language);

        should.not.exist(res.body._private);

        done();
      });
    });

    // cf. GH issue #3
    describe('must replace the password in the logs by (hidden)', function () {

      let logFilePath = '';

      beforeEach(function (done) {
        async.series([
          function ensureLogFileIsEmpty(stepDone) {
            if ( logFilePath.length <= 0 ) return stepDone();
            fs.truncate(logFilePath, function (err) {
              if (err && err.code === 'ENOENT') {
                return stepDone();
              } // ignore error if file doesn't exist
              stepDone(err);
            });
          },
          function generateLogFile(stepDone) {
            logFilePath = os.tmpdir() + '/password-logs.log';
            stepDone();
          },
          function instanciateServerWithLogs(stepDone) {
            let settings = _.cloneDeep(helpers.dependencies.settings);
            settings.logs = {
              file: {
                active: true,
                path: logFilePath,
                level: 'debug',
                maxsize: 500000,
                maxFiles: 50,
                json: false
              }
            };
            server.ensureStarted.call(server, settings, stepDone);
          }
        ], done);
      });

      it('when an error occurs', function (done) {
        let wrongPasswordData = _.cloneDeep(authData);
        wrongPasswordData.password = 'wrongPassword';

        async.series([
          function failLogin(stepDone) {
            request.post(path(authData.username))
              .set('Origin', trustedOrigin)
              .send(wrongPasswordData).end(function (err, res) {
              res.statusCode.should.eql(401);
              stepDone();
            });
          },
          function verifyHiddenPasswordInLogs(stepDone) {
            fs.readFile(logFilePath, 'utf8', function (err, data) {
              if (err) {
                return stepDone(err);
              }
              should(data.indexOf(wrongPasswordData.password) === -1).be.true();
              should(data.indexOf('password=(hidden)') >= 0).be.true();
              stepDone();
            });
          }
        ], done);
      });

      it('except when no password was provided, nothing must be done', function (done) {
        let wrongPasswordData = _.cloneDeep(authData);
        delete wrongPasswordData.password;

        async.series([
          function failLogin(stepDone) {
            request.post(path(authData.username))
              .set('Origin', trustedOrigin)
              .send(wrongPasswordData).end(function (err, res) {
              res.statusCode.should.eql(400);
              stepDone();
            });
          },
          function verifyNoPasswordFieldInLogs(stepDone) {
            fs.readFile(logFilePath, 'utf8', function (err, data) {
              if (err) {
                return stepDone(err);
              }
              should(data.indexOf('password=') === -1).be.true();
              stepDone();
            });
          }
        ], done);
      });

    });
    
    function parallelLogin(appId, callback) {
       // We want our random appId to be trusted, so using recla as origin
      request.post(path(authData.username))
          .set('Origin', 'https://test.rec.la:1234')
          .send({
            username: user.username,
            password: user.password,
            appId: appId
          })
          .end(function (err, res) {
            if(err) {
              return callback(err);
            }
            should(res.statusCode).be.equal(200);
            helpers.dependencies.storage.user.accesses.findOne(user, {name: appId, type: 'personal'}, null,
                (err, access) => {
                  should(access.token).be.equal(res.body.token);
                  callback();
                }
            );
          }
      );
    }

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
            .send(authData).end(function (err, res) {
              token = res.body.token;
              stepDone();
            });
          },
          function (stepDone) {
            request.post(path(user.username)).send({})
            .set('authorization', token).end(function (err, res) {
              res.statusCode.should.eql(200);
              stepDone();
            });
          },
          function (stepDone) {
            request.post(path(user.username)).send({})
            .set('authorization', token).end(function (err, res) {
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
            .end(function (err, res) {
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
          .send(authData).end(function (err, res) {
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
      persistentReq.get(basePath(authData.username) + '/who-am-i').end(function (err, res) {
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
          .end(function (err, res) {
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
      persistentReq.get(basePath(authData.username) + '/who-am-i').end(function (err, res) {
        res.statusCode.should.eql(401);
        should.not.exist(res.body.username);
        should.not.exist(res.body.token);
        done();
      });
    });

  });

});
