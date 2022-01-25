/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

/**
 * @property {timestamp} UNKNOWN_DATE - Unknown creation / modification date
 * @property {string} BY_SYSTEM - When createdBy / modifiedBy value is SYSTEM
 * @property {string} BY_UNKNOWN - When createdBy / modifiedBy value is UNKNOWN
 * @property {string} BY_EXTERNAL_PREFIX - When createdBy / modifiedBy value is an external Reference
 */
const Constants = {
  UNKNOWN_DATE: 10000000.00000001,
  BY_SYSTEM: 'system',
  BY_UNKNOWN: 'unknown',
  BY_EXTERNAL_PREFIX: 'external-'
};

module.exports = Constants;
