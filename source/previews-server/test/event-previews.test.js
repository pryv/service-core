/*global describe, before, beforeEach, it */

require('./test-helpers');

var helpers = require('./helpers'),
    server = helpers.dependencies.instanceManager,
    async = require('async'),
    errors = require('components/errors'),
    fs = require('fs'),
    gm = require('gm'),
    rimraf = require('rimraf'),
    should = require('should'), // explicit require to benefit from static functions
    storage = helpers.dependencies.storage,
    testData = helpers.data,
    timestamp = require('unix-timestamp'),
    xattr = require('fs-xattr');
const superagent = require('superagent'); 

describe('event previews', function () {

  var user = testData.users[0],
      token = testData.accesses[2].token,
      basePath = '/' + user.username + '/events',
      request = null;

  function path(id) {
    return basePath + '/' + id;
  }

  before(function (done) {
    async.series([
      testData.resetUsers,
      testData.resetAccesses,
      testData.resetEvents,
      testData.resetAttachments,
      server.ensureStarted.bind(server, helpers.dependencies.settings),
      function (stepDone) {
        request = helpers.request(server.url);
        stepDone();
      }
    ], done);
  });

  describe('GET /<event id>/preview', function () {

    beforeEach(rimraf.bind(null, storage.user.eventFiles.settings.previewsDirPath));

    it('must return JPEG previews for "picture/attached" events and cache the result',
        function (done) {
      var event = testData.events[2];

      request.get(path(event.id), token)
          .parse(function (res, cb) {
            checkSizeFits(res, {}, { width: 256, height: 256 }, cb);
          })
          .end(function (res) {
        res.statusCode.should.eql(200);
        res.header['content-type'].should.eql('image/jpeg');
        var cachedPath = storage.user.eventFiles.getPreviewFilePath(user, event.id, 256);
        xattr.get(cachedPath, 'user.pryv.eventModified', function (err, modified) {
          modified.toString().should.eql(event.modified.toString());
          done();
        });
      });
    });

    it('must accept ".jpg" extension in the path (backwards-compatibility)', function (done) {
      var event = testData.events[2];
      request.get(path(event.id) + '.jpg', token).end(function (res) {
        res.statusCode.should.eql(200);
        done();
      });
    });

    it('must adjust the desired size to the bigger standard size (if exists)', function (done) {
      var event = testData.events[2];

      request.get(path(event.id), token).query({h: 280})
          .parse(function (res, cb) {
            checkSizeFits(res, {height: 280}, { width: 512, height: 512 }, cb);
          })
          .end(function (res) {
        res.statusCode.should.eql(200);
        res.header['content-type'].should.eql('image/jpeg');
        done();
      });
    });

    it('must limit the desired size to the biggest standard size if too big', function (done) {
      var event = testData.events[2];

      // due to the test image's aspect ratio, the height will exceed the biggest dimension (1024)
      request.get(path(event.id), token).query({width: 280})
          .parse(function (res, cb) {
            checkSizeFits(res, {width: 280}, { width: 1024, height: 1024 }, cb);
          })
          .end(function (res) {
        res.statusCode.should.eql(200);
        res.header['content-type'].should.eql('image/jpeg');
        done();
      });
    });

    /**
     * @param res Must be raw HTTP request (not superagent's wrapper)
     * @param {Object} minTargetSize Can be empty or partially defined
     * @param {Object} maxTargetSize
     * @param done
     */
    function checkSizeFits(res, minTargetSize, maxTargetSize, done) {
      /*jshint -W030*/
      gm(res).size({bufferStream: true}, function (err, size) {
        should.not.exist(err);
        size.width.should.be.within(minTargetSize.width || 0, maxTargetSize.width);
        size.height.should.be.within(minTargetSize.height || 0, maxTargetSize.height);
        (size.width === maxTargetSize.width || size.height === maxTargetSize.height).should.be.ok;
        done();
      });
    }

    it('must serve the cached file if available', function (done) {
      var event = testData.events[2],
          cachedPath,
          cachedStats;
      async.series([
        function retrieveInitialPreview(stepDone) {
          request.get(path(event.id), token).end(function (res) {
            res.statusCode.should.eql(200);
            cachedPath = storage.user.eventFiles.getPreviewFilePath(user, event.id, 256);
            cachedStats = fs.statSync(cachedPath);
            stepDone();
          });
        },
        function retrieveAgain(stepDone) {
          request.get(path(event.id), token).end(function (res) {
            res.statusCode.should.eql(200);
            fs.statSync(cachedPath).should.eql(cachedStats);
            stepDone();
          });
        }
      ], done);
    });

    it('must regenerate the cached file if obsolete', function (done) {
      var event = testData.events[2],
          cachedPath,
          cachedFileModified,
          updatedEvent;
      async.series([
        function retrieveInitialPreview(stepDone) {
          request.get(path(event.id), token).end(function (res) {
            res.statusCode.should.eql(200);
            cachedPath = storage.user.eventFiles.getPreviewFilePath(user, event.id, 256);
            xattr.get(cachedPath, 'user.pryv.eventModified', function (err, modified) {
              cachedFileModified = modified.toString();
              stepDone();
            });
          });
        },
        function updateEvent(stepDone) {
          var update = {
            description: 'Updated',
            modified: timestamp.now(),
            modifiedBy: testData.accesses[2].id
          };
	  storage.user.events.updateOne(user, {id: event.id}, update, function (err, updatedEvt) {
            updatedEvent = updatedEvt;
            stepDone();
          });
        },
        function retrieveAgain(stepDone) {
          request.get(path(event.id), token).end(function (res) {
            res.statusCode.should.eql(200);
            xattr.get(cachedPath, 'user.pryv.eventModified', function (err, modified) {
              modified = modified.toString();
              modified.should.not.eql(cachedFileModified);
              modified.should.eql(updatedEvent.modified.toString());
              stepDone();
            });
          });
        }
      ], done);
    });

    it('must respond with "no content" if the event type is not supported', function (done) {
      request.get(path(testData.events[1].id), token).end(function (res) {
        res.statusCode.should.eql(204);
        done();
      });
    });

    it('must return a proper error if the event does not exist', function (done) {
      request.get(path('unknown-event'), token).end(function (res) {
        res.statusCode.should.eql(404);
        done();
      });
    });

    it('must forbid requests missing an access token', function (done) {
      var url = require('url').resolve(server.url, path(testData.events[2].id));
      superagent.get(url).end(function (err, res) {
        res.statusCode.should.eql(401);
        done();
      });
    });

    it('must forbid requests with unauthorized accesses', function (done) {
      var unauthToken = testData.accesses[3].token;
      request.get(path(testData.events[2].id), unauthToken).end(function (res) {
        res.statusCode.should.eql(403);
        done();
      });
    });

    it('must return a proper error if event data is corrupted (no attachment object)',
        function (done) {
      var data = { streamId: testData.streams[2].id, type: 'picture/attached' },
          createdEvent;
      async.series([
        function addCorruptEvent(stepDone) {
          storage.user.events.insertOne(user, data, function (err, event) {
            createdEvent = event;
            stepDone();
          });
        },
        function getPreview(stepDone) {
          request.get(path(createdEvent.id), token).end(function (res) {
            res.statusCode.should.eql(422);
            res.body.error.id.should.eql(errors.ErrorIds.CorruptedData);
            stepDone();
          });
        }
      ], done);
    });

    it('must return a proper error if event data is corrupted (no attached file)', function (done) {
      var event = testData.events[2],
          filePath = storage.user.eventFiles.getAttachedFilePath(user, event.id,
              event.attachments[0].id),
          tempPath = filePath + '_bak';
      async.series([
        function removeFile(stepDone) {
          fs.rename(filePath, tempPath, stepDone);
        },
        function getPreview(stepDone) {
          request.get(path(event.id), token).end(function (res) {
            res.statusCode.should.eql(422);
            res.body.error.id.should.eql(errors.ErrorIds.CorruptedData);
            stepDone();
          });
        },
        function restoreFile(stepDone) {
          fs.rename(tempPath, filePath, stepDone);
        }
      ], done);
    });

    it('must work with animated GIFs too', function (done) {
      var event = testData.events[12];
      request.get(path(event.id), token).end(function (res) {
        res.statusCode.should.eql(200);
        done();
      });
    });

  });

  describe('POST /clean-up-cache', function () {

    var basePath = '/' + user.username + '/clean-up-cache';

    it('must clean up cached previews not accessed for one week by default', function (done) {
      var event = testData.events[2],
          aCachedPath,
          anotherCachedPath;
      async.series([
        function retrieveAPreview(stepDone) {
          request.get(path(event.id), token).end(function (res) {
            res.statusCode.should.eql(200);
            aCachedPath = storage.user.eventFiles.getPreviewFilePath(user, event.id, 256);
            // add delay as the attribute is written after the response is sent
            setTimeout(xattr.get.bind(xattr, aCachedPath, 'user.pryv.lastAccessed',
                function (err, lastAccessed) {
              should.exist(lastAccessed);
              stepDone();
            }), 50);
          });
        },
        function retrieveAnotherPreview(stepDone) {
          request.get(path(event.id), token).query({h: 511}).end(function (res) {
            res.statusCode.should.eql(200);
            anotherCachedPath = storage.user.eventFiles.getPreviewFilePath(user, event.id, 512);
            xattr.get(anotherCachedPath, 'user.pryv.lastAccessed', stepDone);
          });
        },
        function hackLastAccessTime(stepDone) {
          var twoWeeksAgo = timestamp.now('-2w');
          xattr.set(aCachedPath, 'user.pryv.lastAccessed', twoWeeksAgo.toString(), stepDone);
        },
        function cleanupCache(stepDone) {
          request.post(basePath, token).end(function (res) {
            res.statusCode.should.eql(200);
            xattr.get(aCachedPath, 'user.pryv.lastAccessed', function (err) {
              should.exist(err); // file not found

              xattr.get(anotherCachedPath, 'user.pryv.lastAccessed', function (err, lastAccessed) {
                should.exist(lastAccessed);
                stepDone();
              });
            });
          });
        }
      ], done);
    });

    it('must ignore files with no readable extended attribute', function (done) {
      var event = testData.events[2],
          cachedPath;
      async.series([
        function retrieveAPreview(stepDone) {
          request.get(path(event.id), token).end(function (res) {
            res.statusCode.should.eql(200);
            cachedPath = storage.user.eventFiles.getPreviewFilePath(user, event.id, 256);
            // add delay as the attribute is written after the response is sent
            setTimeout(xattr.get.bind(xattr, cachedPath, 'user.pryv.lastAccessed',
                function (err, lastAccessed) {
              should.exist(lastAccessed);
              stepDone();
            }), 50);
          });
        },
        function removeXAttr(stepDone) {
          xattr.remove(cachedPath, 'user.pryv.lastAccessed', stepDone);
        },
        function cleanupCache(stepDone) {
          request.post(basePath, token).end(function (res) {
            res.statusCode.should.eql(200);
            fs.stat(cachedPath, function (err, stat) {
              should.exist(stat); // file exists
              stepDone();
            });
          });
        }
      ], done);
    });

  });

});
