/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

require('test-helpers/src/api-server-tests-config');

const helpers = require('test-helpers');

before(async function () {
  await helpers.dependencies.init();
});
