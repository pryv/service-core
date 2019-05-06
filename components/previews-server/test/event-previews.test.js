/*global describe, before, beforeEach, it */

require('./test-helpers');

const helpers = require('./helpers');
const server = helpers.dependencies.instanceManager;
const async = require('async');
const errors = require('components/errors');
const fs = require('fs');
const bluebird = require('bluebird');
const gm = require('gm');
const rimraf = require('rimraf');
const { assert } = require('chai');
const storage = helpers.dependencies.storage;
const testData = helpers.data;
const timestamp = require('unix-timestamp');
const xattr = require('fs-xattr');

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

    beforeEach(function(done) {
      rimraf(storage.user.eventFiles.settings.previewsDirPath, done);
    });

    it('[NRT9] must return JPEG previews for "picture/attached" events and cache the result', 
      async function() {
        const request = helpers.unpatchedRequest(server.url);
        const event = testData.events[2];

        const res = await request.get(path(event.id), token);
          
        await checkSizeFits(res.body, {}, { width: 256, height: 256 });
        
        res.statusCode.should.eql(200);
        res.header['content-type'].should.eql('image/jpeg');
        
        const eventFiles = storage.user.eventFiles;
        const cachedPath = eventFiles.getPreviewFilePath(user, event.id, 256);
        
        const modified = await bluebird.fromCallback((cb) => 
          xattr.get(cachedPath, 'user.pryv.eventModified', cb));
        
        modified.toString().should.eql(event.modified.toString());
      });

    it('[FEWU] must accept ".jpg" extension in the path (backwards-compatibility)', function (done) {
      var event = testData.events[2];
      request
        .get(path(event.id) + '.jpg', token)
        .end(function (res) {
          res.statusCode.should.eql(200);
          done();
        });
    });

    it('[PBC1] must adjust the desired size to the bigger standard size (if exists)', async function () {
      const request = helpers.unpatchedRequest(server.url);
      var event = testData.events[2];

      const res = await request.get(path(event.id), token).query({h: 280});
      
      await checkSizeFits(res.body, {height: 280}, { width: 512, height: 512 });
      
      res.statusCode.should.eql(200);
      res.header['content-type'].should.eql('image/jpeg');
    });

    it('[415L] must limit the desired size to the biggest standard size if too big', async function () {
      const request = helpers.unpatchedRequest(server.url);
      var event = testData.events[2];

      // due to the test image's aspect ratio, the height will exceed the biggest dimension (1024)
      const res = await request
        .get(path(event.id), token)
        .query({width: 280});
        
      
      await checkSizeFits(res.body, {width: 280}, { width: 1024, height: 1024 });

      res.statusCode.should.eql(200);
      res.header['content-type'].should.eql('image/jpeg');
    });

    /**
     * @param res Must be raw HTTP request (not superagent's wrapper)
     * @param {Object} minTargetSize Can be empty or partially defined
     * @param {Object} maxTargetSize
     * @param done
     */
    async function checkSizeFits(imageBuffer, minTargetSize, maxTargetSize) {
      const size = await bluebird.fromCallback(
        (cb) => gm(imageBuffer).size({bufferStream: true}, cb));
              
      assert.isAtLeast(size.width, minTargetSize.width || 0);
      assert.isAtMost(size.width, maxTargetSize.width);
      
      assert.isAtLeast(size.height, minTargetSize.height || 0);
      assert.isAtMost(size.height, maxTargetSize.height);
      
      assert.isTrue(
        size.width === maxTargetSize.width || size.height === maxTargetSize.height,
        'Either dimension needs to be maxed out.'
      );
    }

    it('[CWTQ] must serve the cached file if available', function (done) {
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
            
            const newStats = fs.statSync(cachedPath);

            // The file should not have been recreated. By comparing ino and 
            // birthtimeMs, we assume that the file is the same. 
            assert.strictEqual(newStats.ino, cachedStats.ino);
            assert.strictEqual(newStats.birthtimeMs, cachedStats.birthtimeMs);
            
            stepDone();
          });
        }
      ], done);
    });

    it('[2MME] must regenerate the cached file if obsolete', function (done) {
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

    it('[7Y91] must respond with "no content" if the event type is not supported', function (done) {
      request.get(path(testData.events[1].id), token).end(function (res) {
        res.statusCode.should.eql(204);
        done();
      });
    });

    it('[61N8] must return a proper error if the event does not exist', function (done) {
      request.get(path('unknown-event'), token).end(function (res) {
        res.statusCode.should.eql(404);
        done();
      });
    });

    it('[VIJO] must forbid requests missing an access token', function (done) {
      var url = require('url').resolve(server.url, path(testData.events[2].id));
      require('superagent').get(url).end((res) => {
        assert.strictEqual(res.status, 401);
        done();
      });
    });

    it('[FAK4] must forbid requests with unauthorized accesses', function (done) {
      var unauthToken = testData.accesses[3].token;
      request.get(path(testData.events[2].id), unauthToken).end(function (res) {
        res.statusCode.should.eql(403);
        done();
      });
    });

    it('[QUM3] must return a proper error if event data is corrupted (no attachment object)', (done) => {
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

    it('[DQF6] must return a proper error if event data is corrupted (no attached file)', function (done) {
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

    it('[GSDF] must work with animated GIFs too', function (done) {
      var event = testData.events[12];
      request.get(path(event.id), token).end(function (res) {
        res.statusCode.should.eql(200);
        done();
      });
    });

  });

  describe('POST /clean-up-cache', function () {

    var basePath = '/' + user.username + '/clean-up-cache';

    it('[FUYE] must clean up cached previews not accessed for one week by default', function (done) {
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
                assert.isNotNull(lastAccessed);
                stepDone();
              }), 50);
          });
        },
        function retrieveAnotherPreview(stepDone) {
          request.get(path(event.id), token).query({h: 511}).end(function (res) {
            assert.strictEqual(res.statusCode, 200);
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
            assert.strictEqual(res.statusCode, 200);
            xattr.get(aCachedPath, 'user.pryv.lastAccessed', function (err) {
              assert.isNotNull(err);

              xattr.get(anotherCachedPath, 'user.pryv.lastAccessed', function (err, lastAccessed) {
                assert.isNotNull(lastAccessed);
                stepDone();
              });
            });
          });
        }
      ], done);
    });

    it('[G5JR] must ignore files with no readable extended attribute', function (done) {
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
                assert.isNotNull(lastAccessed);
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
              assert.isNotNull(stat);
              stepDone();
            });
          });
        }
      ], done);
    });

  });

});
