/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

/*global describe, before, beforeEach, after, it */

require('./test-helpers');
const helpers = require('./helpers');
const server = helpers.dependencies.instanceManager;
const async = require('async');
const validation = helpers.validation;
const ErrorIds = require('components/errors').ErrorIds;
const should = require('should');
const chai = require('chai');
const assert = chai.assert;
const request = require('superagent');
const testData = helpers.data;
const url = require('url');
const _ = require('lodash');
const fs = require('fs');
const os = require('os');
const UsersRepository = require('components/business/src/users/repository');

describe('auth', function() {
  this.timeout(5000);

  function apiPath(username) {
    return url.resolve(server.url, username );
  }

  function basePath(username) {
    return apiPath(username) + '/auth';
  }

  before(function(done) {
    async.series(
      [
        server.ensureStarted.bind(server, helpers.dependencies.settings),
        testData.resetUsers,
      ],
      done
    );
  });

  afterEach(function(done) {
    helpers.dependencies.storage.sessions.clearAll(done);
  });

  var user = Object.assign({}, testData.users[0]),
    trustedOrigin = 'http://test.pryv.local';

  var authData = {
    username: user.username,
    password: user.password,
    appId: 'pryv-test',
  };

  describe('/login', function() {
    function path(username) {
      return basePath(username) + '/login';
    }

    before(testData.resetAccesses);

    it('[2CV5] must authenticate the given credentials, open a session and return the access token', function(done) {
      async.series(
        [
          function login(stepDone) {
            request
              .post(path(authData.username))
              .set('Origin', trustedOrigin)
              .send(authData)
              .end(function (err, res) {
                assert.strictEqual(res.statusCode, 200);

                should.exist(res.body.token);
                checkNoUnwantedCookie(res);
                should.exist(res.body.preferredLanguage);

                assert.strictEqual(res.body.preferredLanguage, user.language);

                stepDone();
              });
          },
          function checkAccess(stepDone) {
            helpers.dependencies.storage.user.accesses.findOne(
              user,
              { name: authData.appId },
              null,
              function(err, access) {
                access.modifiedBy.should.eql(UsersRepository.options.SYSTEM_USER_ACCESS_ID);
                stepDone();
              }
            );
          },
        ],
        done
      );
    });

    it('[68SH] must return expired', function(done) {
      let personalToken;
      async.series(
        [
          function login(stepDone) {
            request
              .post(path(authData.username))
              .set('Origin', trustedOrigin)
              .send(authData)
              .end(function (err, res) {
                personalToken = res.body.token;
                stepDone();
              });
          },
          function expireSession(stepDone) {
            helpers.dependencies.storage.sessions.expireNow(personalToken,
              function(err, session) {
                stepDone(err);
              }
            );
          },
          function shouldReturnSessionHasExpired(stepDone) {
            request
              .get(apiPath(authData.username) + '/access-info')
              .set('Origin', trustedOrigin)
              .set('Authorization', personalToken)
              .end(function (err, res) {
                assert.strictEqual(res.statusCode, 403);
                assert.strictEqual(res.body.error.message, 'Access session has expired.');
                stepDone();
              });
          },
        ],
        done
      );
    });

    it('[5UMP] must reuse the current session if already open', function(done) {
      var originalToken;
      async.series(
        [
          function login(stepDone) {
            request
              .post(path(authData.username))
              .set('Origin', trustedOrigin)
              .send(authData)
              .end(function(err, res) {
                assert.strictEqual(res.statusCode, 200);
                originalToken = res.body.token;
                stepDone();
              });
          },
          function loginAgain(stepDone) {
            request
              .post(path(authData.username))
              .set('Origin', trustedOrigin)
              .send(authData)
              .end(function(err, res) {
                assert.strictEqual(res.statusCode, 200);
                assert.strictEqual(res.body.token, originalToken);
                stepDone();
              });
          },
        ],
        done
      );
    });

    it('[509A] must accept "wildcarded" app ids and origins', function(done) {
      request
        .post(path(authData.username))
        .set('Origin', 'https://test.rec.la:1234')
        .send(authData)
        .end(function(err, res) {
          assert.strictEqual(res.statusCode, 200);

          done();
        });
    });

    it('[ADL4] must accept "no origin" (i.e. not a CORS request) if authorized', function(done) {
      var authDataNoCORS = _.defaults({ appId: 'pryv-test-no-cors' }, authData);
      request
        .post(path(authDataNoCORS.username))
        .send(authDataNoCORS)
        .end(function(err, res) {
          assert.strictEqual(res.statusCode, 200);

          done();
        });
    });

    it('[A7JL] must also accept "referer" in place of "origin" (e.g. some browsers do not provide "origin")', function(done) {
      request
        .post(path(authData.username))
        .set('Referer', trustedOrigin)
        .send(authData)
        .end(function(err, res) {
          assert.strictEqual(res.statusCode, 200);

          done();
        });
    });

    it('[IKNM] must also accept "referer" in place of "origin" (e.g. some browsers do not provide "origin")', function(done) {
      request
        .post(path(authData.username))
        .set('Referer', trustedOrigin)
        .send(authData)
        .end(function(err, res) {
          res.statusCode.should.eql(200);
          done();
        });
    });

    it('[1TI6] must not be case-sensitive for the username', function(done) {
      request
        .post(path(authData.username))
        .set('Origin', trustedOrigin)
        .send(
          _.defaults({ username: authData.username.toUpperCase() }, authData)
        )
        .end(function(err, res) {
          assert.strictEqual(res.statusCode, 200);

          done();
        });
    });

    it('[L7JQ] must return a correct error when the local credentials are missing or invalid', function(done) {
      var data = _.defaults(
        {
          username: authData.username,
          password: 'bad-password',
        },
        authData
      );
      request
        .post(path(data.username))
        .set('Origin', trustedOrigin)
        .send(data)
        .end(function(err, res) {
          validation.checkError(res, {
            status: 401,
            id: ErrorIds.InvalidCredentials,
          });
          should.not.exist(res.body.token);
          done();
        });
    });

    it('[4AQR] must return a correct error if the app id is missing or untrusted', function(done) {
      var data = _.defaults({ appId: 'untrusted-app-id' }, authData);
      request
        .post(path(data.username))
        .set('Origin', trustedOrigin)
        .send(data)
        .end(function(err, res) {
          validation.checkError(res, {
            status: 401,
            id: ErrorIds.InvalidCredentials,
          });
          should.not.exist(res.body.token);
          done();
        });
    });

    it('[NDB0] must return a correct error if the origin is missing or does not match the app id', function(done) {
      request
        .post(path(authData.username))
        .set('Origin', 'http://mismatching.origin')
        .send(authData)
        .end(function(err, res) {
          validation.checkError(res, {
            status: 401,
            id: ErrorIds.InvalidCredentials,
          });
          should.not.exist(res.body.token);
          done();
        });
    });

    // concurrent requests
    it('[FMJH] must support concurrent login request, saving only the last token that is written in the storage', function(done) {
      const loginCount = 2;
      const randomId = 'pryv-test-' + Date.now();
      const accessStorage = helpers.dependencies.storage.user.accesses;

      async.times(
        loginCount,
        function(n, next) {
          request
            .post(path(authData.username))
            .set('Origin', 'https://test.rec.la:1234')
            .send({
              username: user.username,
              password: user.password,
              appId: randomId,
            })
            .end(function(err, res) {
              if (err) return next(err);
              should(res.statusCode).be.equal(200);
              next(null, res.body.token);
            });
        },
        function(err, results) {
          if (err) return done(err);
          const lastResult = results[1];

          accessStorage.findOne(
            user,
            { name: randomId, type: 'personal' },
            null,
            (err, access) => {
              should(access.token).be.equal(lastResult);
              done();
            }
          );
        }
      );
    });

    // cf. GH issue #57
    it('[9WHP] must not leak _private object from Result', function(done) {
      request
        .post(path(authData.username))
        .set('Origin', trustedOrigin)
        .send(authData)
        .end(function(err, res) {
          assert.strictEqual(res.statusCode, 200);

          should.exist(res.body.token);
          checkNoUnwantedCookie(res);
          should.exist(res.body.preferredLanguage);
          assert.strictEqual(res.body.preferredLanguage, user.language);

          should.not.exist(res.body._private);

          done();
        });
    });

    // cf. GH issue #3
    describe('when we log into a temporary log file', function() {
      let logFilePath = '';

      beforeEach(function(done) {
        async.series(
          [ensureLogFileIsEmpty, generateLogFile, instanciateServerWithLogs],
          done
        );
      });

      function ensureLogFileIsEmpty(stepDone) {
        if (logFilePath.length <= 0) return stepDone();
        const truncateTo = 0; // default
        fs.truncate(logFilePath, truncateTo, function(err) {
          if (err && err.code === 'ENOENT') {
            return stepDone();
          } // ignore error if file doesn't exist
          stepDone(err);
        });
      }

      function generateLogFile(stepDone) {
        logFilePath = os.tmpdir() + '/password-logs.log';
        stepDone();
      }

      function instanciateServerWithLogs(stepDone) {
        let settings = _.cloneDeep(helpers.dependencies.settings);
        settings.logs = {
          file: {
            active: true,
            path: logFilePath,
            level: 'debug',
            maxsize: 500000,
            maxFiles: 50,
            json: false,
          },
        };
        server.ensureStarted.call(server, settings, stepDone);
      }

      after(server.ensureStarted.bind(server, helpers.dependencies.settings));

      it('[C03J] must replace the password in the logs by (hidden) when an error occurs', function(done) {
        let wrongPasswordData = _.cloneDeep(authData);
        wrongPasswordData.password = 'wrongPassword';

        async.series(
          [
            function failLogin(stepDone) {
              request
                .post(path(authData.username))
                .set('Origin', trustedOrigin)
                .send(wrongPasswordData)
                .end(function(err, res) {
                  assert.strictEqual(res.statusCode, 401);
                  stepDone();
                });
            },
            function verifyHiddenPasswordInLogs(stepDone) {
              fs.readFile(logFilePath, 'utf8', function(err, data) {
                if (err) {
                  return stepDone(err);
                }
                should(data.indexOf(wrongPasswordData.password)).be.equal(-1);
                should(data.indexOf('"password":"(hidden password)"')).be.aboveOrEqual(0);
                stepDone();
              });
            },
          ],
          done
        );
      });

      it('[G0YT] must not mention the password in the logs when none is provided', function(done) {
        let wrongPasswordData = _.cloneDeep(authData);
        delete wrongPasswordData.password;

        async.series(
          [
            function failLogin(stepDone) {
              request
                .post(path(authData.username))
                .set('Origin', trustedOrigin)
                .send(wrongPasswordData)
                .end(function(err, res) {
                  assert.strictEqual(res.statusCode, 400);
                  stepDone();
                });
            },
            function verifyNoPasswordFieldInLogs(stepDone) {
              fs.readFile(logFilePath, 'utf8', function(err, data) {
                if (err) {
                  return stepDone(err);
                }
                should(data.indexOf('password=')).be.equal(-1);
                stepDone();
              });
            },
          ],
          done
        );
      });
    });

    function checkNoUnwantedCookie(res) {
      if (!res.headers['set-cookie']) {
        return;
      }

      res.headers['set-cookie']
        .filter(function(cookieString) {
          return cookieString.indexOf('sso=') !== 0; // we only want the SSO cookie
        })
        .should.eql([]);
    }
  });

  describe('/logout', function() {
    function path(username) {
      return basePath(username) + '/logout';
    }

    it('[6W5M] must terminate the access session and fail to logout a second time (session already expired)', function(done) {
      let token;
      async.series(
        [
          function(stepDone) {
            request
              .post(basePath(user.username) + '/login')
              .set('Origin', trustedOrigin)
              .send(authData)
              .end(function(err, res) {
                token = res.body.token;
                if (typeof token !== 'string')
                  return stepDone(new Error('AF: not a string'));

                stepDone();
              });
          },
          function(stepDone) {
            request
              .post(path(user.username))
              .send({})
              .set('authorization', token)
              .end(function(err, res) {
                assert.strictEqual(res.statusCode, 200);

                stepDone();
              });
          },
          function(stepDone) {
            // Session was already closed
            // Trying to logout a second time should fail
            request
              .post(path(user.username))
              .send({})
              .set('authorization', token)
              .end(function(err, res) {
                validation.checkError(
                  res,
                  {
                    status: 403,
                    id: ErrorIds.InvalidAccessToken,
                  },
                  stepDone
                );
              });
          },
        ],
        done
      );
    });

    it('[E2MD] (or any request) must alternatively accept the access token in the query string', function(done) {
      var testRequest = helpers.request(server.url);

      async.series(
        [
          testRequest.login.bind(testRequest, user),
          function(stepDone) {
            request
              .post(path(user.username))
              .query({ auth: testRequest.token })
              .send({})
              .end(function(err, res) {
                assert.strictEqual(res.statusCode, 200);

                stepDone();
              });
          },
        ],
        done
      );
    });
  });

  describe('SSO support', function() {
    // WARNING: exceptionally, tests in here are interdependent and their sequence matters

    const cookie = require('cookie');
    const persistentReq = request.agent();
    let ssoInfo;
    let cookieOptions;
    const persistentReq2 = request.agent();

    before(function (done) {
      persistentReq2
        .post(basePath(authData.username) + '/login')
        .set('Origin', trustedOrigin)
        .send(authData)
        .end(function () {
          done();
        });
    });

    it('[TIDW] GET /who-am-i must return a 410 as it has been removed', function (done) {
      persistentReq2.get(basePath(authData.username) + '/who-am-i')
        .end(function (err, res) {
          assert.strictEqual(res.statusCode, 410);
          done();
        });
    });
    
  });
});
