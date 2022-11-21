/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * JSON Schema specification of methods data for Webhooks.
 */

const Action = require('./Action');
const webhook = require('./webhook');
const helpers = require('./helpers');
const itemDeletion = require('./itemDeletion');
const object = helpers.object;
const string = helpers.string;

module.exports = {
  get: {
    params: object({}, {
      id: 'webhooks.get'
    }),
    result: object({
      webhooks: {
        type: 'array',
        items: webhook(Action.READ)
      }
    }, { required: ['webhooks'] })
  },

  getOne: {
    params: object({
      // in path for HTTP requests
      id: string()
    }, {
      id: 'webhooks.getOne',
      required: ['id']
    }),
    result: object({
      webhook: webhook(Action.READ)
    }, { required: ['webhook'] })
  },

  create: {
    params: webhook(Action.CREATE),
    result: object({
      webhook: webhook(Action.READ)
    }, { required: ['webhook'] })
  },

  update: {
    params: object({
      // in path for HTTP requests
      id: string(),
      // = body of HTTP requests
      update: webhook(Action.UPDATE)
    }, {
      id: 'webhooks.update',
      required: ['id', 'update']
    }),
    result: object({
      webhook: webhook(Action.READ)
    }, {
      required: ['webhook']
    })
  },

  del: {
    params: object({
      // in path for HTTP requests
      id: string()
    }, {
      id: 'webhooks.delete',
      required: ['id']
    }),
    result: object({ webhookDeletion: itemDeletion }, {
      required: ['webhookDeletion'],
      additionalProperties: false
    })
  },

  test: {
    params: object({
      // in path for HTTP requests
      id: string()
    }, {
      id: 'webhooks.test',
      required: ['id']
    }),
    result: object({
      webhook: webhook(Action.READ)
    }, { required: ['webhook'] })
  }
};
