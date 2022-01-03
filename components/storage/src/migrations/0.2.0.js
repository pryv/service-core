/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Initial version (no actual data migration).
 */
module.exports = function (context, callback) {
  context.logInfo('Data version is now 0.2.0');
  callback();
};
