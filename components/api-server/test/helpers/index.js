/**
 * Extends the common test support object with server-specific stuff.
 */

exports = module.exports = require('components/test-helpers');

exports.commonTests = require('./commonTests');
// override
exports.dependencies = require('./dependencies');
exports.validation = require('./validation');
exports.SourceStream = require('./SourceStream');
