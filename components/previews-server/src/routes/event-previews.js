var async = require('async'),
    Cache = require('../utils/Cache'),
    childProcess = require('child_process'),
    CronJob = require('cron').CronJob,
    errors = require('components/errors').factory,
    gm = require('gm'),
    timestamp = require('unix-timestamp'),
    xattr = require('fs-xattr'),
    _ = require('lodash');

// constants
var PreviewNotSupported = 'preview-not-supported',
    StandardDimensions = [ 256, 512, 768, 1024 ],
    SmallestStandardDimension = StandardDimensions[0],
    BiggestStandardDimension = StandardDimensions[StandardDimensions.length - 1],
    StandardDimensionsLength = StandardDimensions.length;

/**
 * Routes for retrieving preview images for events.
 *
 * @param expressApp
 * @param initContextMiddleware
 * @param userEventsStorage
 * @param userEventFilesStorage
 * @param logging
 */
module.exports = function (expressApp, initContextMiddleware, userEventsStorage,
                           userEventFilesStorage, logging) {

  // SERVING PREVIEWS

  expressApp.all('/:username/events/*', initContextMiddleware, loadAccess);

  function loadAccess(req, res, next) {
    req.context.retrieveExpandedAccess(next);
  }

  expressApp.get('/:username/events/:id:extension(.jpg|.jpeg|)', function (req, res, next) {
    var event,
        attachment,
        attachmentPath,
        originalSize,
        previewPath,
        targetSize,
        cached = false;

    async.series([
      function checkEvent(stepDone) {
        userEventsStorage.findOne(req.context.user, {id: req.params.id}, null, function (err, evt) {
          if (err) { return stepDone(err); }

          event = evt;
          if (! event) { return stepDone(errors.unknownResource('event', req.params.id)); }

          if (! req.context.canReadContext(event.streamId, event.tags)) {
            return next(errors.forbidden());
          }

          if (! canHavePreview(event)) { return stepDone(PreviewNotSupported); }

          attachment = getSourceAttachment(event);
          if (! attachment) {
            return stepDone(errors.corruptedData('Corrupt event data: expected an attachment.'));
          }

          attachmentPath = userEventFilesStorage.getAttachedFilePath(req.context.user,
              req.params.id, attachment.id);

          stepDone();
        });
      },
      function getAspectRatio(stepDone) {
        if (attachment.width) {
          originalSize = { width: attachment.width, height: attachment.height };
          return stepDone();
        }

        gm(attachmentPath).size(function (err, size) {
          if (err) {
            return stepDone(adjustGMResultError(err));
          }
          originalSize = size;
          attachment.width = size.width;
          attachment.height = size.height;

          userEventsStorage.update(req.context.user, {id: req.params.id},
              {attachments: event.attachments}, stepDone);
        });
      },
      function preparePath(stepDone) {
        targetSize = getPreviewSize(originalSize, {
          width: req.query.width || req.query.w,
          height: req.query.height || req.query.h
        });
        userEventFilesStorage.ensurePreviewPath(req.context.user, req.params.id,
            Math.max(targetSize.width, targetSize.height), function (err, path) {
          if (err) { return stepDone(err); }
          previewPath = path;
          stepDone();
        });
      },
      function checkCache(stepDone) {
        xattr.get(previewPath, Cache.EventModifiedXattrKey, function (err, cacheModified) {
          if (err) {
            // assume no cache
            return stepDone();
          }
          cached = cacheModified.toString() === event.modified.toString();
          stepDone();
        });
      },
      function generatePreview(stepDone) {
        if (cached) { return stepDone(); }

        gm(attachmentPath + '[0]') // to cover animated GIFs
            .resize(targetSize.width, targetSize.height).noProfile()
            .interlace('Line') // progressive JPEG
            .write(previewPath, function setModifiedTime(err) {
          if (err) {
            return stepDone(adjustGMResultError(err));
          }
          xattr.set(previewPath, Cache.EventModifiedXattrKey, event.modified.toString(), stepDone);
        });
      },
      function respond(stepDone) {
        res.sendfile(previewPath, stepDone);
      }
    ], function handleError(err) {
      if (err) {
        switch (err) {
        case PreviewNotSupported:
          res.send(204);
          break;
        default:
          next(err.name === 'APIError' ? err : errors.unexpectedError(err));
        }
      } else {
        // update last accessed time (don't check result)
        xattr.set(previewPath, Cache.LastAccessedXattrKey, timestamp.now().toString(),
            function () {});
      }
    });
  });

  function canHavePreview(event) {
    return event.type === 'picture/attached';
  }

  function getSourceAttachment(event) {
    // for now: just return the first attachment
    return _.find(event.attachments, function (/*attachment*/) { return true; });
  }

  function adjustGMResultError(err) {
    // assume file not found if code = 1 (gm command result)
    return err.code === 1 ?
        errors.corruptedData('Corrupt event data: expected an attached file.', err) : err;
  }

  function getPreviewSize(original, desired) {
    if (! (desired.width || desired.height)) {
      // return default size
      return { width: SmallestStandardDimension, height: SmallestStandardDimension };
    }

    var originalRatio = original.width / original.height,
        result = {};
    if (! desired.height || desired.width / desired.height > originalRatio) {
      // reference = width
      result.width = adjustToStandardDimension(desired.width);
      result.height = result.width / originalRatio;
    } else {
      // reference = height
      result.height = adjustToStandardDimension(desired.height);
      result.width = result.height * originalRatio;
    }

    // fix if oversize
    if (result.width > BiggestStandardDimension) { result.width = BiggestStandardDimension; }
    if (result.height > BiggestStandardDimension) { result.height = BiggestStandardDimension; }

    return result;
  }

  function adjustToStandardDimension(value) {
    for (var i = 0; i < StandardDimensionsLength; i++) {
      if (value < StandardDimensions[i]) {
        return StandardDimensions[i];
      }
    }
    return StandardDimensions[StandardDimensionsLength - 1];
  }

  // CACHE CLEAN-UP

  var logger = logging.getLogger('previews-cache'),
      workerRunning = false;

  expressApp.post('/clean-up-cache', cleanUpCache);
  expressApp.post('/:username/clean-up-cache', cleanUpCache);

  function cleanUpCache(req, res, next) {
    if (workerRunning) {
      return res.json({message: 'Clean-up already in progress.'}, 200);
    }
    logger.info('Start cleaning up previews cache (on request' +
        (req.headers.origin ? ' from ' + req.headers.origin : '') + ', client IP: ' + req.ip +
        ')...');
    runCacheCleanupWorker(function (err) {
      if (err) {
        return next(errors.unexpectedError(err));
      }
      res.json({message: 'Clean-up successful.'}, 200);
    });
  }

  var cronJob = new CronJob({
    cronTime: userEventFilesStorage.settings.previewsCacheCleanUpCronTime || '00 00 2 * * *',
    onTick: function () {
      if (workerRunning) {
        return;
      }

      logger.info('Start cleaning up previews cache (cron job)...');
      runCacheCleanupWorker();
    }
  });
  logger.info('Start cron job for cache clean-up, time pattern: ' + cronJob.cronTime);
  cronJob.start();

  /**
   * @param {Function} callback Optional, will be passed an error on failure
   */
  function runCacheCleanupWorker(callback) {
    callback = (typeof callback === 'function') ? callback : function () {};

    var worker = childProcess.fork(__dirname + '/../runCacheCleanup.js',
        process.argv.slice(2));
    workerRunning = true;
    worker.on('exit', function (code) {
      workerRunning = false;
      callback(code !== 0 ?
          new Error('Cache cleanup unexpectedly failed (see logs for details)') : null);
    });
  }

};
module.exports.injectDependencies = true;
