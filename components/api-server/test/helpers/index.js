/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Extends the common test support object with server-specific stuff.
 */

exports = module.exports = require('test-helpers');

exports.commonTests = require('./commonTests');
// override
exports.dependencies = require('./dependencies');
exports.validation = require('./validation');
exports.SourceStream = require('./SourceStream');