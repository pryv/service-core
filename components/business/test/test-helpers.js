/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
'use strict';
// Helper methods and setup for all unit tests.
const should = require('should');
const superagent = require('superagent');
const request = require('supertest');
require('test-helpers/src/api-server-tests-config');
module.exports = {
  should,
  superagent,
  request
};
