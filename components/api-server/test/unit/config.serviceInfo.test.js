/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

const chai = require('chai');
const assert = chai.assert;
const { getConfig } = require('@pryv/boiler');
const testServiceInfo = require('../../../../test/service-info.json');

describe('config: serviceInfo', () => {
  let config;
  let isOpenSource;
  before(async () => {
    config = await getConfig();
    isOpenSource = config.get('openSource:isActive');
  });
  describe('when dnsLess is disabled', () => {
    describe('when "serviceInfoUrl" points to a file', () => {
      it('[D2P7] should load serviceInfo', () => {
        const serviceInfo = config.get('service');
        if (!isOpenSource) {
          assert.deepEqual(serviceInfo, testServiceInfo);
        } else {
          assert.deepEqual(serviceInfo, {
            access: 'http://127.0.0.1:3000/reg/access/',
            api: 'http://127.0.0.1:3000/{username}/',
            serial: '2019061301',
            register: 'http://127.0.0.1:3000/reg/',
            name: 'Pryv Lab',
            home: 'https://sw.pryv.me',
            support: 'https://github.com/orgs/pryv/discussions',
            terms: 'https://pryv.com/terms-of-use/',
            eventTypes: 'https://pryv.github.io/event-types/flat.json',
            assets: {
              definitions: 'http://127.0.0.1:3000/www/assets/index.json'
            },
            features: {
              noHF: true
            }
          });
        }
      });
    });
  });
});
