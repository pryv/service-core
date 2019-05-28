/*global describe, it, before, after */

const cuid = require('cuid');
const assert = require('chai').assert;
const bluebird = require('bluebird');
const awaiting = require('awaiting');

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

  describe('when loading Webhooks on startup', () => {

    describe('when creating an event in a Webhook scope', () => {
      
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

      it('should be sent to the notifications server', async () => {
        await new bluebird((resolve, reject) => {
          notificationsServer.on('received', resolve);
          notificationsServer.on('close', () => { });
          notificationsServer.on('error', reject);
        });
        assert.isTrue(notificationsServer.isMessageReceived());
      });
    });

  
  });

  describe('when creating a Webhook through API server', () => {

    const url = 'doesntmatter';

    let webhookId;
    before(async () => {
      const res = await apiServer.request()
        .post(`/${username}/webhooks`)
        .set('Authorization', appAccessToken)
        .send({
          url: url,
        });
      webhookId = res.body.webhook.id;
    });

    it('should send a NATS message to the Webhooks service', async () => {
      let isWebhookActive = false;
      while (! isWebhookActive) {
        const webhooks = webhooksApp.webhooksService.webhooks.get(username);
        webhooks.forEach( w => {
          console.log('comparin', w.id, webhookId);
          if (w.id === webhookId) isWebhookActive = true;
        });
        await awaiting.delay(50);
      }
      assert.isTrue(isWebhookActive);
    });
  });

});