/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const integrityFinalCheck = require('test-helpers/src/integrity-final-check');

afterEach(async function () {
  await integrityFinalCheck.events();
});