/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const nock = require('nock');
const chai = require('chai');
const assert = chai.assert;
const charlatan = require('charlatan');
const { getConfig } = require('@pryv/boiler');
const testServiceInfo = require('../../../../../test/service-info.json');

describe('config: serviceInfo', () => {
  let config;

  before(async () => {
    config = await getConfig();
  });


  describe('when dnsLess is disabled', () => {

    describe('when "serviceInfoUrl" points to a file', () => {
      it('[D2P7] should load serviceInfo', () => {
        const serviceInfo = config.get('service');
        assert.deepEqual(serviceInfo, testServiceInfo);
      });
    });

  });

});
