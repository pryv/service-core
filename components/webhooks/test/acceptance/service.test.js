/*global describe, it, before, after */

const cuid = require('cuid');
const assert = require('chai').assert;
const bluebird = require('bluebird');

const { databaseFixture } = require('components/test-helpers');

require('components/api-server/test/test-helpers');
const { produceMongoConnection, context } = require('components/api-server/test/test-helpers');

const WebhooksApp = require('../../src/application');

const HttpServer = require('components/business/test/acceptance/webhooks/support/httpServer');

describe('webhooks', () => {

  let username, streamId, appAccessId, appAccessToken;
  before(() => {
    username = cuid();
    streamId = cuid();
    appAccessToken = cuid();
    appAccessId = cuid();
  });

  before(() => {
    mongoFixtures = databaseFixture(produceMongoConnection());
    mongoFixtures.clean();
  });

  const port = 5123;
  const postPath = '/notifications';

  const url = 'http://localhost:' + port + postPath;

  before(() => {
    return mongoFixtures.user(username, {}, async (user) => {
      user.stream({
        id: streamId,
      });
      user.access({
        id: appAccessId,
        type: 'app', token: appAccessToken,
        permissions: [{
          streamId: '*',
          level: 'manage',
        }]
      });
      user.webhook({ url: url }, appAccessId);
    });
  });

  let apiServer, mongoFixtures,
    notificationsServer, webhooksApp;
  before(async () => {
    apiServer = await context.spawn();

    notificationsServer = new HttpServer(postPath, 200);
    await notificationsServer.listen(port);

    webhooksApp = new WebhooksApp();
    await webhooksApp.setup();
    await webhooksApp.run();
  });
  after(() => {
    apiServer.stop();
    notificationsServer.close();
    webhooksApp.stop();
  });

  describe('1 notification', () => {

    before(async () => {
      await apiServer.request()
        .post(`/${username}/events`)
        .set('Authorization', appAccessToken)
        .send({
          streamId: streamId,
          type: 'note/txt',
          content: 'salut',
        });
    });

    it('should be received', async () => {
      await new bluebird((resolve, reject) => {
        notificationsServer.on('received', resolve);
        notificationsServer.on('close', () => { });
        notificationsServer.on('error', reject);
      });
      assert.isTrue(notificationsServer.isMessageReceived());
    });

  });

});