/*global describe, it, before, after*/

const assert = require('chai').assert;
const timestamp = require('unix-timestamp');
const awaiting = require('awaiting');
const _ = require('lodash');

const Webhook = require('../../../src/webhooks/Webhook');
const WebhooksRepository = require('../../../src/webhooks/repository');

const HttpServer = require('./support/httpServer');
const PORT = 6123;

//const whStorage = require('components/test-helpers').dependencies.storage.user.webhooks;
const storage = require('components/test-helpers').dependencies.storage.user.webhooks;
const userStorage = require('components/test-helpers').dependencies.storage.users;

const { ProjectVersion } = require('components/middleware/src/project_version');


describe('Webhook', () => {

  describe('send()', () => {

    let repository = new WebhooksRepository(storage, userStorage);
    let notificationsServer;
    let postPath = '/notifications';
    let url = 'http://localhost:' + PORT + postPath;
    const user = {
      username: 'doesnotmatter',
    };

    after( async () => {
      await repository.deleteForUser(user);
    });

    describe('when sending to an existing endpoint', () => {

      describe('when the endpoint answers ASAP', () => {

        before(async () => {
          notificationsServer = new HttpServer(postPath, 200);
          await notificationsServer.listen();
        });

        let apiVersion;
        before(async () => {
          const pv = new ProjectVersion(); 
          apiVersion = await pv.version();
        });

        after(() => {
          notificationsServer.close();
        });

        let webhook, runs, message, requestTimestamp, storedWebhook, serial;

        before(async () => {
          serial = '20190820';
          message = 'hi';
          webhook = new Webhook({
            accessId: 'doesntmatter',
            url: url,
            webhooksRepository: repository,
            user: user,
          });
          webhook.setApiVersion(apiVersion);
          webhook.setSerial(serial);
          await webhook.save();
          requestTimestamp = timestamp.now();
          await webhook.send(message);
          runs = webhook.runs;
          storedWebhook = await repository.getById(user, webhook.id);
        });

        it('[Q7B2] should send it', () => {
          assert.equal(notificationsServer.getMessages()[0], message, 'Webhook sent wrong message.');
        });
        it('[FICW] should add a log to runs', () => {
          assert.equal(runs.length, 1);
          assert.equal(storedWebhook.runs.length, 1);
        });
        it('[2VRK] should add the correct status to the last run', () => {
          assert.equal(runs[0].status, 200);
          assert.equal(storedWebhook.runs[0].status, 200);
        });
        it('[AOCP] should add the correct timestamp to the last run', () => {
          assert.approximately(runs[0].timestamp, requestTimestamp, 0.5, 'Timestamp is unsynced.');
          assert.approximately(storedWebhook.runs[0].timestamp, requestTimestamp, 0.5, 'Timestamp is unsynced.');
        });
        it('[2M6F] should increment runCount', () => {
          assert.equal(webhook.runCount, 1);
          assert.equal(storedWebhook.runCount, 1);
        });
        it('[S1CY] should not increment failCount', () => {
          assert.equal(webhook.failCount, 0);
          assert.equal(storedWebhook.failCount, 0);
        });
        it('[22X1] should send the meta', () => {
          const meta = notificationsServer.getMetas()[0];
          assert.equal(meta.apiVersion, apiVersion);
          assert.equal(meta.serial, serial);
          assert.approximately(meta.serverTime, requestTimestamp, 0.5);
        });
      });

      describe('when the endpoint answers with a long delay', () => {

        postPath = '/delayed';
        url = makeUrl(postPath);
        const minIntervalMs = 50;
        const intraCallsIntervalMs = 100;
        const delay = 500;
        const firstMessage = 'hi1';
        const secondMessage = 'hi2';

        before(async () => {
          notificationsServer = new HttpServer(postPath, 200);
          await notificationsServer.listen();
          notificationsServer.setResponseDelay(delay);
        });

        after(() => {
          notificationsServer.close();
        });

        let webhook;

        before(async () => {
          webhook = new Webhook({
            accessId: 'doesntmatter',
            url: url,
            minIntervalMs: minIntervalMs,
            webhooksRepository: repository,
            user: user,
          });
          setTimeout(() => {
            return webhook.send(secondMessage);
          }, intraCallsIntervalMs);
          webhook.send(firstMessage);
          await awaiting.event(notificationsServer, 'received');
          notificationsServer.setResponseDelay(null);
          await awaiting.event(notificationsServer, 'responding');
          await awaiting.event(notificationsServer, 'responding');
        });

        it('[SRDL] should send the second message after the first', async () => {
          const receivedMessages = notificationsServer.getMessages();
          assert.equal(receivedMessages.length, 2);
          assert.equal(receivedMessages[0], firstMessage);
          assert.equal(receivedMessages[1], secondMessage);
        });

      });

    });

    describe('when sending to an unexistant endpoint', () => {

      let webhook, requestTimestamp, storedWebhook;

      before(async () => {
        webhook = new Webhook({
          accessId: 'doesnmatter',
          url: 'unexistant',
          webhooksRepository: repository,
          user: user,
        });
        await webhook.save();
        requestTimestamp = timestamp.now();
        await webhook.send('doesntmatter');
        storedWebhook = await repository.getById(user, webhook.id);
      });

      after(() => {
        webhook.stop();
      });

      it('[6UJH] should add a log to runs', () => {
        assert.equal(webhook.runs.length, 1);
        assert.equal(storedWebhook.runs.length, 1);
      });
      it('[VKUA] should add the no status to the last run', () => {
        assert.equal(webhook.runs[0].status, 0);
        assert.equal(storedWebhook.runs[0].status, 0);
      });
      it('[40UZ] should add the correct timestamp to the last run', () => {
        assert.approximately(webhook.runs[0].timestamp, requestTimestamp, 0.5, 'Timestamp is unsynced.');
        assert.approximately(storedWebhook.runs[0].timestamp, requestTimestamp, 0.5, 'Timestamp is unsynced.');
      });
      it('[UE17] should increment runCount', () => {
        assert.equal(webhook.runCount, 1, 'runCount should be 1');
        assert.equal(storedWebhook.runCount, 1, 'runCount should be 1');
      });
      it('[UJ2Y] should increment failCount', () => {
        assert.equal(webhook.failCount, 1, 'failCount should be 1');
        assert.equal(storedWebhook.failCount, 1, 'failCount should be 1');
      });
      it('[V5NH] should increment currentRetries', () => {
        assert.equal(webhook.currentRetries, 1, 'in memory currentRetries should be 1');
        assert.equal(storedWebhook.currentRetries, 1, 'stored currentRetries should be 1');
      });

    });

    describe('when scheduling for a retry', () => {

      describe('when the notifications service is down', async () => {

        before(async () => {
          postPath = '/notifs2222';
          url = 'http://localhost:' + PORT + postPath;
          notificationsServer = new HttpServer(postPath, 503);
          await notificationsServer.listen();
        });

        after(() => {
          webhook.stop();
          notificationsServer.close();
        });

        let webhook, run, storedRun, requestTimestamp, storedWebhook;
        const firstMessage = 'hello';

        before(async () => {
          webhook = new Webhook({
            accessId: 'doesntmatter',
            url: url,
            minIntervalMs: 100,
            webhooksRepository: repository,
            user: user,
          });
          await webhook.save();
          requestTimestamp = timestamp.now();
          await webhook.send(firstMessage);
          run = webhook.runs[0];
          storedWebhook = await repository.getById(user, webhook.id);
          storedRun = storedWebhook.runs[0];
        });

        it('[E5VQ] should save the run', () => {
          assert.equal(run.status, 503);
          assert.approximately(run.timestamp, requestTimestamp, 0.1);
          assert.deepEqual(run, webhook.lastRun);
          assert.equal(storedRun.status, 503);
          assert.approximately(storedRun.timestamp, requestTimestamp, 0.1);
          assert.deepEqual(storedRun, storedWebhook.lastRun);
        });
        it('[XP7G] should increment currentRetries', () => {
          assert.equal(webhook.currentRetries, 1);
          assert.equal(storedWebhook.currentRetries, 1);
        });
        it('[9AL1] should schedule for a retry', () => {
          assert.exists(webhook.timeout);
        });
        it('[OHLY] should send scheduled messages after an interval', async () => {
          notificationsServer.setResponseStatus(201);
          await awaiting.event(notificationsServer, 'received');
          assert.isTrue(notificationsServer.isMessageReceived());
          // firstMessage is received the first time although it returns a 503.
          assert.deepEqual(notificationsServer.getMessages(),
            [firstMessage, firstMessage]);

        });
        it('[1VIT] should reset error tracking properties', async () => {
          storedWebhook = await repository.getById(user, webhook.id);
          assert.notExists(webhook.timeout);
          assert.equal(webhook.currentRetries, 0);
          assert.equal(webhook.messageBuffer.size, 0);
          assert.equal(storedWebhook.currentRetries, 0, 'stored currentRetries should be 0');
        });
        
      });
    });

    describe('when throttling frequent calls', () => {
      
      before(async () => {
        postPath = '/notifs3';
        url = 'http://localhost:' + PORT + postPath;
        notificationsServer = new HttpServer(postPath, 200);
        await notificationsServer.listen();
      });

      after(() => {
        webhook.stop();
        notificationsServer.close();
      });

      let webhook, runs, storedWebhook;
        
      const firstMessage = 'hello';
      const secondMessage = 'hello2';
      const thirdMessage = 'hello3';

      before(async () => {
        webhook = new Webhook({
          accessId: 'doesntmatter',
          url: url,
          minIntervalMs: 100,
          webhooksRepository: repository,
          user: user,
        });
        await webhook.save();
        await webhook.send(firstMessage);
        await webhook.send(firstMessage);
        await webhook.send(secondMessage);
        await webhook.send(thirdMessage);
        runs = webhook.runs;
        storedWebhook = await repository.getById(user, webhook.id);
      });

      it('[73TG] should only send the message once', () => {
        assert.equal(notificationsServer.getMessageCount(), 1, 'server should receive the message once');
        assert.equal(runs.length, 1, 'Webhook should have 1 run');
        assert.equal(storedWebhook.runs.length, 1, 'Webhook should have 1 run');
        assert.deepEqual(notificationsServer.getMessages(), [firstMessage]);
      });
      it('[WPMH] should accumulate messages', () => {
        assert.deepEqual(webhook.getMessageBuffer(), 
          [firstMessage, secondMessage, thirdMessage]);
      });
      it('[YLWK] should schedule for a retry after minInterval', () => {
        assert.exists(webhook.timeout);
      });
      it('[OZGP] should send scheduled messages after an interval', async () => {
        notificationsServer.resetMessageReceived();
        await awaiting.event(notificationsServer, 'received');
        assert.isTrue(notificationsServer.isMessageReceived());
        assert.deepEqual(notificationsServer.getMessages(), 
          [firstMessage, firstMessage, secondMessage, thirdMessage]);
      });
      it('[86OP] should remove the timeout afterwards', () => {
        assert.notExists(webhook.timeout);
      });

    });

    describe('when the webhook becomes inactive after failures', () => {

      let webhook, storedWebhook;
      before(async () => {
        postPath = '/notifs5';
        url = 'http://localhost:' + PORT + postPath;
        notificationsServer = new HttpServer(postPath, 400);
        await notificationsServer.listen();
      });

      after(async () => {
        webhook.stop();
        notificationsServer.close();
      });

      before(async () => {
        webhook = new Webhook({
          accessId: 'doesntmatter',
          url: url,
          minIntervalMs: 10,
          webhooksRepository: repository,
          user: user,
        });
        await webhook.save();
        await webhook.send('hello');
      });

      it('[768L] should run 5 times', async () => {
        await awaiting.event(notificationsServer, 'received');
        await awaiting.event(notificationsServer, 'received');
        await awaiting.event(notificationsServer, 'received');
        await awaiting.event(notificationsServer, 'received');
        await awaiting.event(notificationsServer, 'received');
      });
      it('[PX10] should update the state to inactive', () => {
        assert.equal(webhook.state, 'inactive');
      });
      it('[BLNP] should update the stored version', async () => {
        storedWebhook = await repository.getById(user, webhook.id);
        assert.equal(storedWebhook.state, 'inactive');
      });
      it('[ODNM] should not run anymore', async () => {
        const msgCount = notificationsServer.getMessageCount();
        const runCount = webhook.runCount;
        await webhook.send();
        assert.equal(notificationsServer.getMessageCount(), msgCount);
        assert.equal(webhook.runCount, runCount);
      });
    });

    describe('when the runs array gets shifted', () => {

      const message = 'hello';
      let webhook;
      before(async () => {
        postPath = '/notifs4';
        url = 'http://localhost:' + PORT + postPath;
        notificationsServer = new HttpServer(postPath, 200);
        await notificationsServer.listen();
      });

      after(async () => {
        webhook.stop();
        notificationsServer.close();
      });

      before(async () => {
        webhook = new Webhook({
          accessId: 'doesntmatter',
          url: url,
          minIntervalMs: 10,
          webhooksRepository: repository,
          user: user,
          runsSize: 3,
        });
        await webhook.save();
      });

      let runs1, runs2, runs3;

      it('[1MK2] should only save 3 items', async () => {
        await webhook.send(message);
        await webhook.send(message);
        await webhook.send(message);
        runs1 = _.cloneDeep(webhook.runs);
      });
      it('[FYOR] should rotate the runs', async () => {
        await webhook.send(message);
        runs2 = _.cloneDeep(webhook.runs);
        assert.deepEqual(runs1[1], runs2[1]);
        assert.deepEqual(runs1[2], runs2[2]);
        assert.notEqual(runs1[0], runs2[0]);
      });
      it('[XDAF] should rotate the runs more', async () => {
        await webhook.send(message);
        runs3 = webhook.runs;
        assert.equal(runs3[0].status, runs2[0].status);
        assert.approximately(runs3[0].timestamp, runs2[0].timestamp, 100);
        assert.notEqual(runs3[1], runs2[1]);
        assert.notEqual(runs3[1], runs1[1]);
        assert.notEqual(runs3[2], runs1[2]);
      });

    });

  });
});

function makeUrl(path) {
  return 'http://localhost:' + PORT + path;
}