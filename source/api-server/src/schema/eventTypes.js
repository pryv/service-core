// @flow

var request = require('superagent'),
    validation = require('./validation'),
    _ = require('lodash');
    
interface LogFactory {
  getLogger(name: string): Logger; 
}
interface Logger {
  warn(msg: string): void;
}

type EventTypeSettings = {
  sourceURL: string, 
}

/**
 * JSON Schema specifications for known types of event content. Uses
 * `event-types.default.json` as the default source file, and tries to
 * asynchronously update from the URL defined by config setting
 * `eventTypes.sourceURL`.
 */
module.exports = function (eventTypesSettings: EventTypeSettings, logging: LogFactory) {
  var types = require('./event-types.default.json'),
      logger = logging.getLogger('event-types');

  tryUpdateFromSourceURL();

  return types;

  function tryUpdateFromSourceURL() {
    request.get(eventTypesSettings.sourceURL).end(function (err, res) {
      if (err || !res.ok) {
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
      });
    });
  }
};
module.exports.injectDependencies = true;
