/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * JSON Schema specification of methods data for event streams.
 */

const Action = require('./Action');
const stream = require('./stream');
const itemDeletion = require('./itemDeletion');
const helpers = require('./helpers');
const object = helpers.object;
const array = helpers.array;
const string = helpers.string;
const number = helpers.number;
const boolean = helpers.boolean;

module.exports = {
  get: {
    params: object({
      parentId: string(),
      state: string({ enum: ['default', 'all'] }),
      includeDeletionsSince: number()
    }),
    result: object({
      streams: array({ $ref: '#/definitions/stream' }),
      eventDeletions: array(itemDeletion)
    }, {
      definitions: {
        // TODO: clean this schema $ref thing up
        stream: stream(Action.READ, false, '#/definitions/stream')
      },
      required: ['streams']
    })
  },

  create: {
    params: stream(Action.CREATE),
    result: object({
      stream: stream(Action.READ, true)
    }, {
      required: ['stream'],
      additionalProperties: false
    })
  },

  update: {
    params: object({
      // in path for HTTP requests
      id: string(),
      // = body of HTTP requests
      update: { $ref: '#/definitions/stream' }
    }, {
      definitions: {
        // TODO: clean this schema $ref thing up
        stream: stream(Action.UPDATE, false, '#/definitions/stream')
      },
      required: ['id', 'update']
    }),
    result: object({
      stream: stream(Action.READ, true)
    }, {
      required: ['stream'],
      additionalProperties: false
    })
  },

  del: {
    params: object({
      // in path for HTTP requests
      id: string(),
      // in query string for HTTP requests
      mergeEventsWithParent: boolean()
    }, {
      required: ['id']
    }),
    result: {
      anyOf: [
        object({ stream: stream(Action.READ, true) }, {
          required: ['stream'],
          additionalProperties: false
        }),
        object({ streamDeletion: itemDeletion }, {
          required: ['streamDeletion'],
          additionalProperties: false
        })
      ]
    }
  }
};
