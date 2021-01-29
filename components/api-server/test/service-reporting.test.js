/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/* global describe, beforeEach, afterEach, it */

require('./test-helpers');
const httpServer = require('./support/httpServer');
const awaiting = require('awaiting');
const assert = require('chai').assert;
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

const Promise = require('bluebird');

describe('service-reporting', () => {

  let mongoFixtures;
  before(async function() {
    mongoFixtures = databaseFixture(await produceMongoConnection());
    if ((await getConfig()).get('openSource:isActive')) this.skip();
    
  });
  after(async () => {
    await mongoFixtures.clean();
  });

  before(async () => {
    const user = await mongoFixtures.user(monitoringUsername);
    user.access({
      type: 'app', token: monitorToken,
    });
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

    it('[G1UG] must start and successfully send a report when service-reporting is listening', async () => {
      await awaiting.event(reportHttpServer, 'report_received');
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

async function assertServerStarted() {
  // throws if the server is off
  await server.request()
        .get(`/${monitoringUsername}/events`)
        .set('Authorizaiton', monitorToken);
}