/* global describe, before, after, it */

require('./test-helpers');
const httpServer = require('./support/httpServer');
const awaiting = require('awaiting');

const { context } = require('./test-helpers');
let server;
let infoHttpServer;
let reportHttpServer;
let reportMock;
let serviceInfoMock;
const infoHttpServerPort = 5123;
const reportHttpServerPort = 4001;
describe('Service', () => {

  before(async () => {
    serviceInfoMock = {
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

    reportMock = {
      licenseName: 'pryv.io-test-license',
      apiVersion: '1.4.26',
      templateVersion: '1.0.0'
    };

    infoHttpServer = new httpServer('/service/info', 200, serviceInfoMock);
    reportHttpServer = new httpServer('/reports', 200, reportMock, 'post');
    await infoHttpServer.listen(infoHttpServerPort);
    await reportHttpServer.listen(reportHttpServerPort);

    server = await context.spawn();
  });

  after(async () => {
    server.stop();
    infoHttpServer.close();
    reportHttpServer.close();
  });

  describe('POST report on service-reporting', () => {
    it('[G1UG] must successfully send a report when service-reporting is listening', async () => {
      await awaiting.event(reportHttpServer, 'received');
    });
  });
});
