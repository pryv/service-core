/*global describe, it, before, after */

const cuid = require('cuid');
const assert = require('chai').assert;
const awaiting = require('awaiting');
const timestamp = require('unix-timestamp');
const _ = require('lodash');

const { databaseFixture } = require('components/test-helpers');
const { webhooksStorage } = require('../test-helpers');

require('components/api-server/test/test-helpers');
const { produceMongoConnection, context } = require('components/api-server/test/test-helpers');

const WebhooksApp = require('../../src/application');

const { Webhook, Repository } = require('components/business').webhooks;

const repository = new Repository(webhooksStorage);
const HttpServer = require('components/business/test/acceptance/webhooks/support/httpServer');

describe('webhooks', function() {

  let user, username, 
      streamId, appAccessId, appAccessToken, 
      webhook, webhook2, webhookId,
      url, url2,
      notificationsServer, notificationsServer2;

  let mongoFixtures;
  before(function() {
    mongoFixtures = databaseFixture(produceMongoConnection());
  });

  const port = 5123;
  const port2 = 5124;
  const postPath = '/notifications';
  const mockServerHostname = 'http://localhost:';

  before(function() {
    url = mockServerHostname + port + postPath;
    url2 = mockServerHostname + port2 + postPath;
  });

  let apiServer, webhooksApp, webhooksService;
  before(async function () {
    apiServer = await context.spawn();
  });
  after(async function () {
    await mongoFixtures.clean();
    await apiServer.stop();
    webhooksApp.stop();
  });

  describe('when loading Webhooks on startup', function() {

    describe('when booting the webhooks application', function() {

      before(function () {
        username = cuid();
        streamId = cuid();
        appAccessToken = cuid();
        appAccessId = cuid();
      });

      before(async function () {
        user = await mongoFixtures.user(username, {});
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
        webhook = await user.webhook({ url: url }, appAccessId);
        webhook = webhook.attrs;
        webhook2 = await user.webhook({
          url: url2,
          state: 'inactive',
        }, appAccessId);
        webhook2 = webhook2.attrs;
      });

      
      before(async function () {
        notificationsServer = new HttpServer(postPath, 200);
        notificationsServer.listen(port);
        notificationsServer2 = new HttpServer(postPath, 200);
        notificationsServer2.listen(port2);
      });
      after(async function () {
        await notificationsServer.close();
        await notificationsServer2.close();
      });

      before(async function() {
        webhooksApp = new WebhooksApp();
        await webhooksApp.setup();
        await webhooksApp.run();
        webhooksService = webhooksApp.webhooksService;
      });

      it('should send a boot message to all active webhooks', async function() {
        assert.equal(notificationsServer.getMessageCount(), 1);
        const activeWebhook = await repository.getById(user, webhook.id);
        assert.equal(activeWebhook.runCount, 1);
      });
      it('should send nothing to inactive webhooks', async function () {
        const inactiveWebhook = await repository.getById(user, webhook2.id);
        assert.equal(inactiveWebhook.runCount, 0);
      });
    });

    describe('when creating an event in a Webhook scope', function() {
      
      describe('when the notifications server is running', function() {

        before(async function() {
          notificationsServer = new HttpServer(postPath, 200);
          await notificationsServer.listen(port);
        });
        after(async function() {
          await notificationsServer.close();
        });

        before(function() {
          username = cuid();
          appAccessId = cuid();
          appAccessToken = cuid();
          streamId = cuid();
        });

        before(async function() {
          user = await mongoFixtures.user(username);
          await user.access({
            id: appAccessId,
            token: appAccessToken,
            type: 'app',
            permissions: [{
              streamId: '*',
              level: 'manage',
            }],
          });
          await user.stream({ id: streamId });
          webhook = await user.webhook({
            accessId: appAccessId,
            url: url,
          });
          webhook = new Webhook(_.merge(webhook.attrs, { webhooksRepository: repository, user: user}));
          await webhooksService.addWebhook(username, webhook);
        });

        let requestTimestamp;
        before(async function() {
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

        it('should send API call to the notifications server', async function() {
          await awaiting.event(notificationsServer, 'received');
          assert.isTrue(notificationsServer.isMessageReceived());
        });

        it('should update the Webhook\'s data to the storage', async function() {
          const updatedWebhook = await repository.getById(user, webhook.id);
          assert.equal(updatedWebhook.runCount, 1, 'wrong runCount');
          const runs = updatedWebhook.runs;
          assert.equal(runs.length, 1, 'wrong amount of runs');
          const run = runs[0];
          assert.equal(run.status, 200);
          assert.approximately(run.timestamp, requestTimestamp, 0.5);
        });
      });
    });
  
  });

  describe('when creating a Webhook through api-server', function() {

    const url = 'doesntmatter';
    before(async function() {
      const res = await apiServer.request()
        .post(`/${username}/webhooks`)
        .set('Authorization', appAccessToken)
        .send({
          url: url,
        });
      webhookId = res.body.webhook.id;
    });

    it('should register a new webhook in the service through NATS', async function() {
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

  describe('when there are running webhooks', function() {

    before(function() {
      username = cuid();
      appAccessId = cuid();
      appAccessToken = cuid();
      webhookId = cuid();
      streamId = cuid();
    });

    before(async function() {
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

    before(async function() {
      await webhooksApp.webhooksService.addWebhook(username, new Webhook({
        id: webhookId,
      }));
    });

    describe('when deleting a webhook through API server', function() {

      before(async function() {
        await apiServer.request()
          .delete(`/${username}/webhooks/${webhookId}`)
          .set('Authorization', appAccessToken);
      });

      it('should deactivate the current running webhook through NATS', async function() {
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

    describe('when deleting an access through API server', function() {

      

    });

    describe('when an access expires', function() {
    

    });
    
  });

  

});