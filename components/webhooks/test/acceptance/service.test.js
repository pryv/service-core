/* global describe, it, before, after */

const cuid = require('cuid');
const { assert } = require('chai');
const awaiting = require('awaiting');
const timestamp = require('unix-timestamp');
const _ = require('lodash');
const bluebird = require('bluebird');

const { databaseFixture } = require('components/test-helpers');

require('components/api-server/test/test-helpers');
const { produceMongoConnection, context } = require('components/api-server/test/test-helpers');

const { Webhook, Repository } = require('components/business').webhooks;

const repository = new Repository(webhooksStorage);
const HttpServer = require('components/business/test/acceptance/webhooks/support/httpServer');
const WebhooksApp = require('../../src/application');
const { webhooksStorage } = require('../test-helpers');

const { BOOT_MESSAGE } = require('../../src/messages');

describe('webhooks', () => {
  let user; let username;
  let streamId; let appAccessId; let appAccessToken;
  let webhook; let webhook2; let webhookId;
  let url; let url2;
  let notificationsServer;

  let mongoFixtures;
  before(async () => {
    mongoFixtures = databaseFixture(await produceMongoConnection());
  });

  const port = 5123;
  const port2 = 5124;
  const postPath = '/notifications';
  const mockServerHostname = 'http://localhost:';

  before(() => {
    url = mockServerHostname + port + postPath;
    url2 = mockServerHostname + port2 + postPath;
  });

  let apiServer; let webhooksApp; let
      webhooksService;
  before(async () => {
    apiServer = await context.spawn({
      webhooks: {
        minIntervalMs: 10,
      },
    });
  });
  after(async () => {
    await mongoFixtures.clean();
    await apiServer.stop();
    webhooksApp.stop();
  });

  describe('when loading Webhooks on startup', () => {
    describe('when booting the webhooks application', () => {
      before(() => {
        username = cuid();
        streamId = cuid();
        appAccessToken = cuid();
        appAccessId = cuid();
      });

      before(async () => {
        user = await mongoFixtures.user(username, {});
        await user.stream({
          id: streamId,
        });
        await user.access({
          id: appAccessId,
          type: 'app',
          token: appAccessToken,
          permissions: [{
            streamId: '*',
            level: 'manage',
          }],
        });
        webhook = await user.webhook({ url }, appAccessId);
        webhook = webhook.attrs;
        webhook2 = await user.webhook({
          url: url2,
          state: 'inactive',
        }, appAccessId);
        webhook2 = webhook2.attrs;
      });

      before(async () => {
        notificationsServer = new HttpServer(postPath, 200);
        notificationsServer.listen(port);
      });
      after(async () => {
        await notificationsServer.close();
      });

      before(async () => {
        webhooksApp = new WebhooksApp();
        await webhooksApp.setup();
        await webhooksApp.run();
        webhooksService = webhooksApp.webhooksService;
      });
      after(async () => {
        webhooksApp.stop();
      });

      it('[YD6N] should send a boot message to all active webhooks', async () => {
        assert.equal(notificationsServer.getMessageCount(), 1);
        const activeWebhook = await repository.getById(user, webhook.id);
        assert.equal(activeWebhook.runCount, 1);
        const messages = notificationsServer.getMessages();
        assert.equal(messages[0], BOOT_MESSAGE);
        const metas = notificationsServer.getMetas();
        assert.equal(metas[0].apiVersion, webhooksService.apiVersion);
        assert.equal(metas[0].serial, webhooksService.serial);
        assert.approximately(metas[0].serverTime, Date.now() / 1000, 100);
      });
      it('[UM4T] should send nothing to inactive webhooks', async () => {
        const inactiveWebhook = await repository.getById(user, webhook2.id);
        assert.equal(inactiveWebhook.runCount, 0);
      });
    });

    describe('when creating an event in a Webhook scope', () => {
      describe('when the notifications server is running', () => {
        before(async () => {
          notificationsServer = new HttpServer(postPath, 200);
          await notificationsServer.listen(port);
        });
        after(async () => {
          await notificationsServer.close();
        });

        before(() => {
          username = cuid();
          appAccessId = cuid();
          appAccessToken = cuid();
          streamId = cuid();
        });

        before(async () => {
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
            url,
          });
          webhook = new Webhook(_.merge(webhook.attrs, { webhooksRepository: repository, user }));
          await webhooksService.addWebhook(username, webhook);
        });

        let requestTimestamp;
        before(async () => {
          requestTimestamp = timestamp.now();
          await apiServer.request()
            .post(`/${username}/events`)
            .set('Authorization', appAccessToken)
            .send({
              streamId,
              type: 'note/txt',
              content: 'salut',
            });
        });

        it('[3TMH] should send API call to the notifications server', async () => {
          await awaiting.event(notificationsServer, 'received');
          assert.isTrue(notificationsServer.isMessageReceived());
        });

        it('[7N4L] should update the Webhook\'s data to the storage', async () => {
          const updatedWebhook = await repository.getById(user, webhook.id);
          assert.equal(updatedWebhook.runCount, 1, 'wrong runCount');
          const { runs } = updatedWebhook;
          assert.equal(runs.length, 1, 'wrong amount of runs');
          const run = runs[0];
          assert.equal(run.status, 200);
          assert.approximately(run.timestamp, requestTimestamp, 0.5);
        });
      });
    });
  });

  describe('[BBB] when creating a Webhook through api-server', () => {
    describe('when the notifications server is running returning 400', () => {
      before(async () => {
        webhooksApp = new WebhooksApp();
        await webhooksApp.setup();
        await webhooksApp.run();
        webhooksService = webhooksApp.webhooksService;
      });
      after(async () => {
        webhooksApp.stop();
      });

      before(async () => {
        notificationsServer = new HttpServer(postPath, 400);
        await notificationsServer.listen(port);
      });
      after(async () => {
        await notificationsServer.close();
      });
      before(() => {
        username = cuid();
        streamId = cuid();
        appAccessToken = cuid();
        appAccessId = cuid();
      });

      before(async () => {
        user = await mongoFixtures.user(username, {});
        await user.stream({
          id: streamId,
        });
        await user.access({
          id: appAccessId,
          type: 'app',
          token: appAccessToken,
          permissions: [{
            streamId: '*',
            level: 'manage',
          }],
        });
      });

      before(async () => {
        const res = await apiServer.request()
          .get(`/${username}/webhooks`)
          .set('Authorization', appAccessToken);
        const { webhooks } = res.body;
        const webhooksDeletes = [];
        webhooks.forEach((w) => {
          webhooksDeletes.push(
            apiServer.request()
              .delete(`/${username}/webhooks/${w.id}`)
              .set('Authorization', appAccessToken),
          );
        });
        await bluebird.all(webhooksDeletes);
      });
      before(async () => {
        const res = await apiServer.request()
          .post(`/${username}/webhooks`)
          .set('Authorization', appAccessToken)
          .send({
            url,
          });
        webhookId = res.body.webhook.id;
      });

      it('[EXQD] should register a new webhook in the service through NATS', async () => {
        let isWebhookActive = false;
        while (!isWebhookActive) {
          const [, webhook] = webhooksService.getWebhook(username, webhookId);
          if (webhook != null) {
            isWebhookActive = true;
          }
          await awaiting.delay(10);
        }
        assert.isTrue(isWebhookActive);
      });

      it('[8Q4E] should deactivate after failures', async () => {
        let res = await apiServer.request()
          .post(`/${username}/streams`)
          .set('Authorization', appAccessToken)
          .send({
            id: cuid(),
            name: cuid(),
          });
        await awaiting.event(notificationsServer, 'received');
        await awaiting.event(notificationsServer, 'received');
        await awaiting.event(notificationsServer, 'received');
        await awaiting.event(notificationsServer, 'received');
        await awaiting.event(notificationsServer, 'received');
        await awaiting.event(notificationsServer, 'received');
        /**
         * The webhook running for this test is activated by other actions and might be run more than 6 times.
         */
        await awaiting.delay(200);
        res = await apiServer.request()
          .get(`/${username}/webhooks`)
          .set('Authorization', appAccessToken);
        const webhook = res.body.webhooks[0];
        assert.equal(webhook.state, 'inactive');
      });

      it('[PY61] should be run again when updating its state', async () => {
        let res = await apiServer.request()
          .put(`/${username}/webhooks/${webhookId}`)
          .set('Authorization', appAccessToken)
          .send({ state: 'active' });
        const { webhook } = res.body;
        assert.equal(webhook.state, 'active');
        res = await apiServer.request()
          .post(`/${username}/streams`)
          .set('Authorization', appAccessToken)
          .send({
            id: cuid(),
            name: cuid(),
          });
        assert.exists(res.body.stream);
        await awaiting.event(notificationsServer, 'received');
        assert.equal(notificationsServer.getMessageCount() > 6, true);
      });
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
        name: 'doesntmatter',
      });
      await user.access({
        id: appAccessId,
        type: 'app',
        token: appAccessToken,
        permissions: [{
          streamId,
          level: 'manage',
        }],
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

      it('[904D] should deactivate the current running webhook through NATS', async () => {
        let isWebhookActive = true;
        while (isWebhookActive) {
          const webhooks = webhooksApp.webhooksService.webhooks.get(username);
          isWebhookActive = false;
          webhooks.forEach((w) => {
            if (w.id === webhookId) {
              isWebhookActive = true;
            }
          });
          await awaiting.delay(10);
        }
        assert.isFalse(isWebhookActive);
      });
    });
  });
});
