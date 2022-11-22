/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
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
            access: 'http://localhost:3000/reg/access/',
            api: 'http://localhost:3000/{username}/',
            serial: '2019061301',
            register: 'http://localhost:3000/reg/',
            name: 'Pryv Lab',
            home: 'https://sw.pryv.me',
            support: 'https://pryv.com/helpdesk',
            terms: 'https://pryv.com/terms-of-use/',
            eventTypes: 'https://api.pryv.com/event-types/flat.json',
            assets: {
              definitions: 'http://localhost:3000/www/assets/index.json'
            }
          });
        }
      });
    });
  });
});
