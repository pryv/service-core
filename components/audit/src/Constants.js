/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const CONSTANTS = {
  STORE_PREFIX: ':_audit:',
  ACCESS_STREAM_ID_PREFIX: 'access-',
  ACTION_STREAM_ID_PREFIX: 'action-',
  EVENT_TYPE_VALID: 'audit-log/pryv-api',
  EVENT_TYPE_ERROR: 'audit-log/pryv-api-error'
};

Object.freeze(CONSTANTS);

module.exports = CONSTANTS;
