/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
var helpers = require('./helpers');

/**
 * JSON Schema specification for item deletions.
 */
module.exports = helpers.object({
  id: helpers.string(),
  deleted: helpers.number()
}, {
  id: 'itemDeletion',
  required: ['id'],
  additionalProperties: false
});
