/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/* global describe, before, after, it */

require('./test-helpers');
const cuid = require('cuid');
const helpers = require('./helpers');
const validation = helpers.validation;
const methodsSchema = require('../src/schema/service-infoMethods');
const { databaseFixture } = require('test-helpers');
const { produceMongoConnection, context } = require('./test-helpers');
const httpServer = require('./support/httpServer');
const { getConfig } = require('@pryv/boiler');

const username = cuid();
let server;
let mongoFixtures;
let infoHttpServer;
let mockInfo;
const infoHttpServerPort = 5123;
describe('Service', () => {
  before(async () => {
    const config = await getConfig();
    mockInfo = config.get('service');

    infoHttpServer = new httpServer('/service/info', 200, mockInfo);
    await infoHttpServer.listen(infoHttpServerPort);
    mongoFixtures = databaseFixture(await produceMongoConnection());
    await mongoFixtures.user(username, {});
    server = await context.spawn();
  });

  after(async () => {
    await mongoFixtures.clean();
    server.stop();
    infoHttpServer.close();
  });

  describe('GET /service/info', () => {
    it('[FR4K] must return all service info', async () => {
      const path = '/' + username + '/service/info';
      const res = await server.request().get(path);
      validation.check(res, {
        status: 200,
        schema: methodsSchema.get.result,
        body: mockInfo
      });
    });
  });
});
