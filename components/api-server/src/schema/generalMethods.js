/**
 * JSON Schema specification of general methods data.
 */

const Action = require('./Action');
const access = require('./access');
const helpers = require('./helpers');

const { object } = helpers;
const { string } = helpers;
const { array } = helpers;

module.exports = {
  getAccessInfo: {
    params: object({}, { id: 'getAccessInfo' }),
    result: object({
      type: {
        type: 'string',
        enum: ['personal', 'app', 'shared'],
      },
      name: string(),
      permissions: access.permissions(Action.READ),
    }, {
      required: ['type', 'name', 'permissions'],
    }),
  },

  callBatch: {
    params: array(object({
      method: string(),
      params: {
        type: ['object', 'array'],
      },
    }, {
      required: ['method', 'params'],
    })),
    result: object({
      results: array(object({})),
    }),
  },
};
