/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
module.exports = {
  diff: true,
  extension: ['js'],
  opts: false,
  package: './package.json',
  reporter: 'spec',
  slow: 75,
  timeout: 2000,
  require: 'test/helpers.js',
  ui: 'bdd',
  'watch-files': ['test/**/*.js']
};