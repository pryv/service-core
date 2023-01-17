/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Extends the common test support object with server-specific stuff.
 */

module.exports = require('test-helpers');

// override
module.exports.dependencies = require('./dependencies');
