/**
 * Extends the common test support object with server-specific stuff.
 */

module.exports = require('components/test-helpers');

// override
module.exports.dependencies = require('./dependencies');
