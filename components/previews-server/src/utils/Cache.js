var async = require('async'),
    fs = require('fs'),
    timestamp = require('unix-timestamp'),
    xattr = require('xattr-async');

module.exports = Cache;

/**
 * Basic implementation for file cache cleanup, relying on xattr.
 *
 * @param {Object} settings
 * @constructor
 */
function Cache(settings) {
  this.settings = settings;
  this.cleanUpInProgress = false;
}

// declare XAttr constants

// must be prefixed with "user." to work on all systems
Cache.EventModifiedXattrKey = 'user.pryv.eventModified';
Cache.LastAccessedXattrKey = 'user.pryv.lastAccessed';

/**
 * Removes all cached files that haven't been accessed since the given time.
 *
 * @param {Function} callback
 */
Cache.prototype.cleanUp = function (callback) {
  if (this.cleanUpInProgress) {
    return callback(new Error('Clean-up is already in progress.'));
  }
  this.cleanUpInProgress = true;

  var cutoffTime = timestamp.now() - this.settings.maxAge;
  var processFile = function (path, stepDone) {
    xattr.get(path, Cache.LastAccessedXattrKey, function (err, value) {
      if (! value || +value >= cutoffTime) {
        return stepDone();
      }
      fs.unlink(path, stepDone);
    });
  }.bind(this);

  var done = function (err) {
    this.cleanUpInProgress = false;
    callback(err || null);
  }.bind(this);

  walkDirectory(this.settings.rootPath, function (err, files) {
    if (err) { return callback(err); }
    async.forEach(files, processFile, done);
  });
};

function walkDirectory(dir, done) {
  var results = [];
  fs.readdir(dir, function (err, list) {
    if (err) { return done(err); }

    var i = 0;
    (function next() {
      var file = list[i++];
      if (! file) {
        return done(null, results);
      }
      file = dir + '/' + file;

      fs.stat(file, function (err, stat) {
        if (stat && stat.isDirectory()) {
          walkDirectory(file, function (err, res) {
            results = results.concat(res);
            next();
          });
        } else {
          results.push(file);
          next();
        }
      });
    })();
  });
}
