/**
 * Shallow wrapper around `slug` to ensure consistent usage.
 */

const slug = require('slug');

slug.defaults.mode = 'rfc3986';
slug.defaults.modes['rfc3986'].lower = false;
slug.extend({'_': '_'});

module.exports = slug;
