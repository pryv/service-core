/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * JSON Schema specification for Webhooks.
 */

const Action = require('./Action');
const helpers = require('./helpers');
const object = helpers.object;
const string = helpers.string;
const number = helpers.number;
const array = helpers.array;

/**
 * @param {Action} action
 */
exports = module.exports = function (action) {
  if (action === Action.STORE) { action = Action.READ; } // read items === stored items

  const base = object({
    id: string(),
    accessId: string(),
    url: string(),
    state: string(),
    runCount: number(),
    failCount: number(),
    lastRun: run,
    runs: array(run),
    currentRetries: number(),
    maxRetries: number(),
    minIntervalMs: number()
  },
  {
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
        'lastRun',
        'runs',
        'currentRetries',
        'maxRetries',
        'minIntervalMs',
        'created',
        'createdBy',
        'modified',
        'modifiedBy'
      ];
      break;
    case Action.CREATE:
      base.required = ['url'];
      break;
    case Action.UPDATE:
      base.alterableProperties = ['state'];
      break;
  }

  return base;
};

const run = object({
  status: number(),
  timestamp: number()
},
{
  required: [
    'status',
    'timestamp'
  ]
}
);
