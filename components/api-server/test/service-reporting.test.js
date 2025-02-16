/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

const { setTimeout } = require('timers/promises');
require('./test-helpers');
const HttpServer = require('./support/httpServer');
const { assert } = require('chai');
const hostname = require('os').hostname;
const cuid = require('cuid');

const { databaseFixture } = require('test-helpers');
const { produceMongoConnection, context } = require('./test-helpers');

const { getConfig } = require('@pryv/boiler');

let server;
let reportHttpServer;
let infoHttpServer;
const INFO_HTTP_SERVER_PORT = 5123;
const REPORT_HTTP_SERVER_PORT = 4001;
const CORE_ROLE = 'api-server';
const customSettings = {
  domain: 'test.pryv.com',
  reporting: {
    licenseName: 'pryv.io-test-license',
    templateVersion: '1.0.0'
  }
};
const monitoringUsername = cuid();
const monitorToken = cuid();

describe('service-reporting', () => {
  let mongoFixtures;
  before(async function () {
    mongoFixtures = databaseFixture(await produceMongoConnection());
    if ((await getConfig()).get('openSource:isActive')) this.skip();
  });
  after(async () => {
    await mongoFixtures.clean();
  });

  before(async () => {
    const user = await mongoFixtures.user(monitoringUsername);
    user.access({
      type: 'app', token: monitorToken
    });
    await mongoFixtures.user(cuid());
  });

  describe('POST report on service-reporting (started)', () => {
    let reportRecieved = false;
    before(async () => {
      infoHttpServer = new HttpServer('/service/info', 200);
      reportHttpServer = new HttpServer('/reports', 200);

      reportHttpServer.on('report_received', function () {
        reportRecieved = true;
      });

      await infoHttpServer.listen(INFO_HTTP_SERVER_PORT);
      await reportHttpServer.listen(REPORT_HTTP_SERVER_PORT);
      server = await context.spawn(customSettings);
    });

    after(async () => {
      server.stop();
      reportHttpServer.close();
    });

    it('[G1UG] must start and successfully send a report when service-reporting is listening', async () => {
      await setTimeout(1000);
      assert.isTrue(reportRecieved, 'Should have received report received event from server');
      await assertServerStarted();
      const lastReport = reportHttpServer.getLastReport();
      const reportingSettings = customSettings.reporting;

      assert.equal(lastReport.licenseName, reportingSettings.licenseName, 'missing or wrong licenseName');
      assert.equal(lastReport.role, CORE_ROLE, 'missing or wrong role');
      assert.equal(lastReport.templateVersion, reportingSettings.templateVersion, 'missing or wrong templatVersion');
      assert.equal(lastReport.hostname, hostname(), 'missing or wrong hostname');
      assert.isAbove(lastReport.clientData.userCount, 0, 'missing or wrong numUsers');
      assert.exists(lastReport.clientData.serviceInfoUrl, 'missing serviceInfourl');
    });
  });
});

async function assertServerStarted () {
  // throws if the server is off
  await server.request()
    .get(`/${monitoringUsername}/events`)
    .set('Authorizaiton', monitorToken);
}
