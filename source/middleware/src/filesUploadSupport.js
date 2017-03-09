/**
 * Transparently handles multipart requests for uploading file attachments.
 * Files uploaded, if any, will be in req.files, while the rest of the request will be as for a
 * regular pure JSON request (i.e. uploaded data in req.body).
 */

var errors = require('components/errors').factory;

module.exports = function (req, res, next) {
  if (req.is('multipart/form-data')) {
    var bodyKeys = Object.keys(req.body);

    if (bodyKeys.length > 1) {
      return next(errors.invalidRequestStructure(
        'In multipart requests, we don\'t expect more than one non-file part.'));
    } else if (bodyKeys.length === 1) {
      try {
        req.body = JSON.parse(req.body[bodyKeys[0]]);
      } catch (error) {
        return next(errors.invalidRequestStructure(
          'In multipart requests, we expect the non-file part to be valid JSON.'));
      }
    }
  }

  next();
};
