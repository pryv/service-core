var request = require('superagent'),
    validation = require('./validation'),
    _ = require('lodash');

/**
 * JSON Schema specifications for known types of event content.
 * Uses `event-types.default.json` as the default source file,
 * and tries to asynchronously update from the URL defined by config setting `eventTypes.sourceURL`.
 *
 * TODO: regularly retrieve event types with timer (cron)
 *
 * @param eventTypesSettings Event types eventTypesSettings
 * @param logging
 */
module.exports = function (eventTypesSettings, logging) {
  var types = require('./event-types.default.json'),
      logger = logging.getLogger('event-types');
  types.isDefault = true;

  tryUpdateFromSourceURL();

  return types;

  function tryUpdateFromSourceURL() {
    request.get(eventTypesSettings.sourceURL).end(function (err, res) {
      if (err || ! res.ok) {
        return logger.warn('Could not update event types from ' + eventTypesSettings.sourceURL +
            '\nError: ' + err ? err.message : res.status + ': ' + res.text);
      }
      validation.validateSchema(res.body, function (err) {
        if (err) {
          return logger.warn('Invalid event types schema returned from ' +
              eventTypesSettings.sourceURL + '\nErrors: ' + err.errors);
        }
        // OK, override current definitions
        _.extend(types, res.body);
        types.isDefault = false;
      });
    });
  }
};
module.exports.injectDependencies = true;
