/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Each migration must be:
 *
 * - Idempotent: results in the same state whether run once or multiple times
 * - Interruption-resistant: if interrupted, is able to proceed when run again
 */
module.exports = {
  '1.7.0': require('./1.7.0.js'),
  '1.7.1': require('./1.7.1.js'),
  '1.7.5': require('./1.7.5.js'),
  '1.8.0': require('./1.8.0.js'),
};
