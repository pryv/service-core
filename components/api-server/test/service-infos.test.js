/* global describe, before, after, it */

require('./test-helpers');
const cuid = require('cuid');
const helpers = require('./helpers');
const validation = helpers.validation;
const methodsSchema = require('../src/schema/service-infosMethods');
const { databaseFixture } = require('components/test-helpers');
const { produceMongoConnection, context } = require('./test-helpers');
const httpServer = require('./support/httpServer');

const username = cuid();
let server;
let mongoFixtures;
let infoHttpServer;
let mockInfos;
const infoHttpServerPort = 5123;
describe('Service', () => {

  before(async () => {
      mockInfos = {
      serial: '2019062601',
      access: 'https://access.pryv.io/access',
      api: 'https://{username}.pryv.io/',
      register: 'https://reg.pryv.io',
      name: 'Pryv Test',
      home: 'https://sw.pryv.me',
      support: 'https://pryv.com/helpdesk',
      terms: 'https://pryv.com/pryv-lab-terms-of-use/',
      eventTypes: 'https://api.pryv.com/event-types/flat.json'
    };

    infoHttpServer = new httpServer('/service/infos', 200, mockInfos);
    await infoHttpServer.listen(infoHttpServerPort);
    mongoFixtures =  databaseFixture(await produceMongoConnection());
    await mongoFixtures.user(username, {});
    server = await context.spawn();
  });

  after(async () => {
    await mongoFixtures.clean();
    server.stop();
    infoHttpServer.close();
  });

  describe('GET /service/infos', () => {
    it('[FR4K] must return all service infos', async () => {
      let path = '/' + username + '/service/infos';
      const res = await server.request().get(path);
      validation.check(res, {
        status: 200,
        schema: methodsSchema.get.result,
        body: mockInfos
      });
    });
  });
});
