/* global describe, beforeEach, afterEach, it */

require('./test-helpers');
const httpServer = require('./support/httpServer');
const awaiting = require('awaiting');
const assert = require('chai').assert;
const hostname = require('os').hostname;
const cuid = require('cuid');

const { databaseFixture } = require('components/test-helpers');
const { produceMongoConnection, context } = require('./test-helpers');

let server;
let reportHttpServer;
let infoHttpServer;
const INFO_HTTP_SERVER_PORT = 5123;
const REPORT_HTTP_SERVER_PORT = 4001;
const CORE_ROLE = 'core';
const customSettings = {
  domain: 'test.pryv.com',
  reporting: {
    url: 'http://localhost:' + REPORT_HTTP_SERVER_PORT + '/reports',
    optOut: false,
    licenseName: 'pryv.io-test-license',
    templateVersion: '1.0.0',
    hostname: hostname(),
  }
};

const Promise = require('bluebird');

describe('service-reporting', () => {

  let mongoFixtures;
  before(async function() {
    mongoFixtures = databaseFixture(await produceMongoConnection());
  });
  after(async () => {
    await mongoFixtures.clean();
  });

  before(async () => {
    await mongoFixtures.user(cuid());
    await mongoFixtures.user(cuid());
  });

  describe('POST report on service-reporting (started)', () => {
    before(async () => {

      infoHttpServer = new httpServer('/service/info', 200);
      reportHttpServer = new httpServer('/reports', 200);
      await infoHttpServer.listen(INFO_HTTP_SERVER_PORT);
      await reportHttpServer.listen(REPORT_HTTP_SERVER_PORT);

      server = await context.spawn(customSettings);
    });

    after(async () => {
      server.stop();
      reportHttpServer.close();
    });

    it('[G1UG] server must start and successfully send a report when service-reporting is listening', async () => {
      await awaiting.event(reportHttpServer, 'report_received');
      assert.isNotEmpty(server.baseUrl); // Check the server has booted

      const lastReport = reportHttpServer.getLastReport();
      const reportingSettings = customSettings.reporting;
      assert.equal(lastReport.licenseName, reportingSettings.licenseName, 'missing or wrong licenseName');
      assert.equal(lastReport.role, CORE_ROLE, 'missing or wrong role');
      assert.equal(lastReport.templateVersion, reportingSettings.templateVersion, 'missing or wrong templatVersion');
      assert.equal(lastReport.domain, reportingSettings.domain, 'missing or wrong domain');
      assert.equal(lastReport.hostname, reportingSettings.hostname, 'missing or wrong hostname');
      assert.isAbove(lastReport.clientData.numUsers, 0, 'missing or wrong numUsers');
    });
  });

  describe('POST opt-out and don\'t send report on service-reporting (started)', () => {
    beforeEach(async () => {
      reportHttpServer = new httpServer('/reports', 200);
      await reportHttpServer.listen(REPORT_HTTP_SERVER_PORT);

      customSettings.reporting.optOut = 'true';
      server = await context.spawn(customSettings);
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
            assert.isNotEmpty(server.baseUrl); // Check the server has booted
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
      assert.isNotEmpty(server.baseUrl); // Check the server has booted
    });
  });
});