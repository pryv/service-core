/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * JSON Schema specification of methods errors.
 * Error objects are usually found in property `error` of method results.
 */

module.exports = {
  id: 'error',
  type: 'object',
  additionalProperties: false,
  properties: {
    id: {
      type: 'string'
    },
    message: {
      type: 'string'
    },
    data: {
      type: ['string', 'object', 'array']
    },
    subErrors: {
      type: 'array',
      items: {
        $ref: '#error'
      }
    }
  },
  required: ['id', 'message']
};
