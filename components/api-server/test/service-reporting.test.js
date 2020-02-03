/* global describe, beforeEach, afterEach, it */

require('./test-helpers');
const httpServer = require('./support/httpServer');
const awaiting = require('awaiting');
const chai = require('chai');
const assert = chai.assert;

const { context } = require('./test-helpers');
let server;
let reportHttpServer;
let reportMock;
const reportHttpServerPort = 4001;

const Promise = require('bluebird');

describe('service-reporting', () => {

  describe('POST report on service-reporting (started)', () => {
    beforeEach(async () => {
      reportMock = {
        licenseName: 'pryv.io-test-license',
        apiVersion: '1.4.26_D',
        templateVersion: '1.0.0'
      };

      reportHttpServer = new httpServer('/reports', 200, reportMock);
      await reportHttpServer.listen(reportHttpServerPort);

      server = await context.spawn();
    });

    afterEach(async () => {
      server.stop();
      reportHttpServer.close();
    });

    it('[G1UG] server must start and successfully send a report when service-reporting is listening', async () => {
      await awaiting.event(reportHttpServer, 'report_received');
      assert.isNotEmpty(server.baseUrl);
    });
  });

  describe('POST opt-out and don\'t send report on service-reporting (started)', () => {
    beforeEach(async () => {
      reportMock = {
        licenseName: 'pryv.io-test-license',
        apiVersion: '1.4.26_E',
        templateVersion: '1.0.0'
      };

      reportHttpServer = new httpServer('/reports', 200, reportMock);
      await reportHttpServer.listen(reportHttpServerPort);

      // process.env['PRYV_REPORTING_OFF'] = '1';
      // console.log('setting process.env.PRYV_REPORTING_OFF to ', process.env.PRYV_REPORTING_OFF);
      const settings = {
        services: {
          reporting: {
            optOut: true
          }
        }
      };
      server = await context.spawn(settings);
    });

    afterEach(async () => {
      server.stop();
      reportHttpServer.close();
    });

    it('[UR7L] server must start and not send a report when opting-out reporting', async () => {
      await new Promise(async function (resolve) {
        await awaiting.event(reportHttpServer, 'report_received');
        resolve();
      }).timeout(1000)
        .then(() => {
          throw new Error('Should not have received a report');
        })
        .catch(error => {
          if (error instanceof Promise.TimeoutError) {
            // Everything is ok, the promise should have timeouted
            // since the report has not been sent.
            assert.isNotEmpty(server.baseUrl);
          } else {
            assert.fail(error.message);
          }
        });
    });
  });

  describe('POST report on service-reporting (shut down)', () => {
    beforeEach(async () => {
      server = await context.spawn();
    });
    
    afterEach(async () => {
      server.stop();
    });

    it('[H55A] server must start when service-reporting is not listening', async () => {
      assert.isNotEmpty(server.baseUrl);
    });
  });
});
