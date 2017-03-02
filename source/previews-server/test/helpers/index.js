/**
 * Extends the common test support object with server-specific stuff.
 */

exports = module.exports = require('components/test-helpers');

// override
exports.dependencies = require('./dependencies');
