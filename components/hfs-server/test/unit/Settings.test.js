/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
'use strict';
const { getConfig } = require('boiler');
// @flow

const should = require('should');

/* global describe, it */

describe('Settings', function() {
  it('[KEEZ] should have been loaded for test execution', async function() {
    should.exist(await getConfig());
  });
});
