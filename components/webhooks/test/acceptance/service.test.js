/*global describe, it, before, after */

const cuid = require('cuid');
const assert = require('chai').assert;
const bluebird = require('bluebird');
const awaiting = require('awaiting');
const timestamp = require('unix-timestamp');

const { databaseFixture } = require('components/test-helpers');
const { usersStorage, webhooksStorage } = require('../test-helpers');

require('components/api-server/test/test-helpers');
const { produceMongoConnection, context } = require('components/api-server/test/test-helpers');

const WebhooksApp = require('../../src/application');

const Webhook = require('components/business').webhooks.Webhook;
const HttpServer = require('components/business/test/acceptance/webhooks/support/httpServer');

describe('webhooks', () => {

  let username, streamId, appAccessId, appAccessToken, webhookId;
  before(() => {
    username = cuid();
    streamId = cuid();
    appAccessToken = cuid();
    appAccessId = cuid();
  });

  let mongoFixtures;
  before(() => {
    mongoFixtures = databaseFixture(produceMongoConnection());
  });

  const port = 5123;
  const postPath = '/notifications';

  const url = 'http://localhost:' + port + postPath;

  before(async () => {
    const user = await mongoFixtures.user(username, {});
    await user.stream({
      id: streamId,
    });
    await user.access({
      id: appAccessId,
      type: 'app', token: appAccessToken,
      permissions: [{
        streamId: '*',
        level: 'manage',
      }]
    });
    await user.webhook({ url: url }, appAccessId);
  });

  let apiServer, webhooksApp;
  before(async () => {
    apiServer = await context.spawn();
    webhooksApp = new WebhooksApp();
    await webhooksApp.setup();
    await webhooksApp.run();
  });
  after(async () => {
    await mongoFixtures.clean();
    await apiServer.stop();
    webhooksApp.stop();
  });

  describe('when loading Webhooks on startup', () => {

    describe('when creating an event in a Webhook scope', () => {
      
      describe('when the notifications server is running', () => {

        let notificationsServer;
        before(async () => {
          notificationsServer = new HttpServer(postPath, 200);
          await notificationsServer.listen(port);
        });

        after(async () => {
          await notificationsServer.close();
        });

        let requestTimestamp;
        before(async () => {
          requestTimestamp = timestamp.now();
          await apiServer.request()
            .post(`/${username}/events`)
            .set('Authorization', appAccessToken)
            .send({
              streamId: streamId,
              type: 'note/txt',
              content: 'salut',
            });
        });

        it('should send API call to the notifications server', async () => {
          await awaiting.event(notificationsServer, 'received');
          assert.isTrue(notificationsServer.isMessageReceived());
        });

        it('should update the Webhook\'s data to the storage', async () => {
          const webhooks = await bluebird.fromCallback((cb) => webhooksStorage.find({ username: username }, {}, {}, cb));
          assert.exists(webhooks);
          assert.equal(webhooks.length, 1, 'Incorrect webhooks length');
          const updatedWebhook = webhooks[0];
          assert.equal(updatedWebhook.runCount, 1);
          const runs = updatedWebhook.runs;
          assert.equal(runs.length, 1);
          const run = runs[0];
          assert.equal(run.status, 200);
          assert.approximately(run.timestamp, requestTimestamp, 0.5);
        });
      });
    });
  
  });

  describe('when creating a Webhook through api-server', () => {

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

    it('should register a new webhook in the service through NATS', async () => {
      const webhooksService = webhooksApp.webhooksService;
      let isWebhookActive = false;
      while (! isWebhookActive) {
        const [ , webhook,  ] = webhooksService.getWebhook(username, webhookId);
        if (webhook != null) {
          isWebhookActive = true;
        }
        await awaiting.delay(10);
      }
      assert.isTrue(isWebhookActive);
    });
  });

  describe('when there are running webhooks', () => {

    before(() => {
      username = cuid();
      appAccessId = cuid();
      appAccessToken = cuid();
      webhookId = cuid();
      streamId = cuid();
    });

    before(async () => {
      const user = await mongoFixtures.user(username, {});
      await user.stream({
        id: streamId,
        name: 'doesntmatter'
      });
      await user.access({
        id: appAccessId,
        type: 'app', token: appAccessToken,
        permissions: [{
          streamId: streamId,
          level: 'manage',
        }]
      });
      await user.webhook({ 
        url: 'doesntmatter',
        id: webhookId,
      }, appAccessId);
    });

    before(async () => {
      await webhooksApp.webhooksService.addWebhook(username, new Webhook({
        id: webhookId,
      }));
    });

    describe('when deleting a webhook through API server', () => {

      before(async () => {
        await apiServer.request()
          .delete(`/${username}/webhooks/${webhookId}`)
          .set('Authorization', appAccessToken);
      });

      it('should deactivate the current running webhook through NATS', async () => {
        let isWebhookActive = true;
        while (isWebhookActive) {
          const webhooks = webhooksApp.webhooksService.webhooks.get(username);
          isWebhookActive = false;
          webhooks.forEach( w => {
            if (w.id === webhookId) {
              isWebhookActive = true;
            }
          });
          await awaiting.delay(10);
        }
        assert.isFalse(isWebhookActive);
      });
    });

    describe('when deleting an access through API server', () => {

      

    });

    describe('when an access expires', () => {
    

    });
    
  });

  

});