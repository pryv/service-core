/**
 * JSON Schema specification for Webhooks.
 */

const Action = require('./Action');
const helpers = require('./helpers');
const object = helpers.object;
const string = helpers.string;
const number = helpers.number;

/**
 * @param {Action} action
 */
exports = module.exports = function (action) {
  if (action === Action.STORE) { action = Action.READ; } // read items === stored items

  var base = object({
    'id': string(),
    'accessId': string(),
    'url': string(),
    'state': string(),
    'runCount': number(),
    'failCount': number(),
    'currentRetries': number(),
    'runs': number(),
    'minIntervalMs': number(),
    'maxRetries': number(),
  }, {
      additionalProperties: false
    });
  helpers.addTrackingProperties(base);

  switch (action) {
    case Action.READ:
      base.required = [
        'id', 
        'accessId',
        'url',
        'state',
        'runCount',
        'failCount',
        'runs',
        'minIntervalMs',
        'maxRetries',
        'created',
        'createdBy',
        'modified',
        'modifiedBy'];
      break;

    case Action.CREATE:
      base.required = ['url'];
  }

  return base;
};
