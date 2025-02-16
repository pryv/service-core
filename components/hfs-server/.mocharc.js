/**
 * @license
 * Copyright (C)  Pryv https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
module.exports = {
  // as of 2022-03-28, extending another config doesn’t work (cf. https://github.com/mochajs/mocha/pull/4407),
  // so we have to duplicate settings in the root `.mocharc.js`
  // extends: '../../../.mocharc.js',
  exit: true,
  slow: 75,
  timeout: 8000,
  ui: 'bdd',
  diff: true,
  reporter: 'dot',
  spec: 'test/**/*.test.js'
};
