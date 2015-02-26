var errors = require('components/errors').factory,
    _ = require('lodash');

/**
 * Checks permissions to access the file attachment, then translates the request's resource path to
 * match the actual physical path for static-serving the file.
 *
 * @param userEventsStorage
 */
module.exports = function (userEventsStorage) {
  return function (req, res, next) {
    userEventsStorage.findOne(req.context.user, {id: req.params.id}, null, function (err, event) {
      if (err) {
        return next(errors.unexpectedError(err));
      }
      if (! event) {
        return next(errors.unknownResource('event', req.params.id));
      }
      if (! req.context.canReadStream(event.streamId)) {
        return next(errors.forbidden());
      }

      req.url = req.url.replace(req.params.username, req.context.user.id).replace('/events/', '/');
      if (req.params.fileName) {
        // ignore filename (it's just there to help clients build nice URLs)
        var encodedFileId = encodeURIComponent(req.params.fileId);
        req.url = req.url.substr(0, req.url.indexOf(encodedFileId) + encodedFileId.length);
      }

      // set response content type (we can't rely on the filename)
      var attachment = event.attachments ?
          _.find(event.attachments, {id: req.params.fileId}) : null;
      if (! attachment) {
        return next(errors.unknownResource('attachment', req.params.fileId));
      }
      res.header('Content-Type', attachment.type);

      next();
    });
  };
};
module.exports.injectDependencies = true;
