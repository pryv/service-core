/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Shallow wrapper around `slug` to ensure consistent usage.
 */

const slug = require('slug');

slug.defaults.mode = 'rfc3986';
slug.defaults.modes.rfc3986.lower = false;
slug.extend({ _: '_' });

module.exports = slug;
