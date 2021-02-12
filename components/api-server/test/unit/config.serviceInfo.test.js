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

describe.skip('config: serviceInfo', () => {
  let config;

  before(async () => {
    config = await getConfig();
  });

  describe('init()', () => {
    describe('when dnsLess is active', () => {
     
      before(() => {
        config.injectTestConfig({
          dnsLess: { isActive: true }
        });
      });

      it('[O4I1] should work', async () => {
        await getConfig();
      });
      it('[KEH6] should build serviceInfo', () => {
        const serviceInfo = config.get('service');
        let dnsLessPublicUrl = config.get('dnsLess:publicUrl');
        if (dnsLessPublicUrl.slice(-1) === '/') dnsLessPublicUrl = dnsLessPublicUrl.slice(0, -1);

        const REG_PATH = '/reg';
        const WWW_PATH = '/www';
        
        const serial = parseInt(serviceInfo.serial.slice(1));        

        assert.approximately(serial, Date.now() / 1000, 5);
        assert.equal(serviceInfo.api, dnsLessPublicUrl + '/{username}/');
        assert.equal(serviceInfo.register, dnsLessPublicUrl + REG_PATH + '/');
        assert.equal(serviceInfo.access, dnsLessPublicUrl + REG_PATH + '/access/');
        assert.deepEqual(serviceInfo.assets, {
          definitions: dnsLessPublicUrl + WWW_PATH + '/assets/index.json',
        });
      });
    });

    describe('when dnsLess is disabled', () => {
      before(() => {
        config.injectTestConfig({
          dnsLess: { isActive: false },
        });
      });

      describe('when "serviceInfoUrl" points to a file', () => {
        it('[WOQ8] should work', async () => {
          await getConfig();
        });
        it('[D2P7] should load serviceInfo', () => {
          const serviceInfo = config.get('service');
          assert.deepEqual(serviceInfo, testServiceInfo);
        });
      });

      describe('when "serviceInfoUrl" points to an online resource', () => {

        let serviceInfo;
        before(() => {
          const regUrl = 'https://reg.mydomain.com';
          const SERVICE_INFO_PATH = '/service/info';
          config.set('serviceInfoUrl', regUrl + SERVICE_INFO_PATH);

          serviceInfo = {
            salut: 'abc',
            encore: 'def',
            yolo: 123,
          };

          nock(regUrl)
            .get(SERVICE_INFO_PATH)
            .reply(200, serviceInfo);
        });

        it('[4WYN] should work', async () => {
          await getConfig();
        });
        it('[NY3E] should load serviceInfo', () => {
          const configServiceInfo = config.get('service');
          assert.deepEqual(configServiceInfo, serviceInfo);
        });
      });
      
    });
  });
});
