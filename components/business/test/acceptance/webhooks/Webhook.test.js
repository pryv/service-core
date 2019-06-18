/*global describe, it, before, afterR*/

const assert = require('chai').assert;
const timestamp = require('unix-timestamp');
const bluebird = require('bluebird');

const Webhook = require('../../../src/webhooks/Webhook');

const HttpServer = require('./support/httpServer');
const PORT = 6123;

const storage = require('components/test-helpers').dependencies.storage.user.webhooks;

describe('Webhook', () => {

  describe('send()', () => {

    let notificationsServer;
    let postPath = '/notifications';
    let url = 'http://localhost:' + PORT + postPath;
    const user = {
      username: 'doesnotmatter',
    };

    after( async () => {
      await bluebird.fromCallback(
        cb => storage.removeAll(user, cb));
    });

    describe('when sending to an existing endpoint', () => {

      before(async () => {
        notificationsServer = new HttpServer(postPath, 200);
        await notificationsServer.listen();
      });

      after(() => {
        notificationsServer.close();
      });

      let webhook, runs, message, requestTimestamp,
        storedWebhook;

      before(async () => {
        message = 'hi';
        webhook = new Webhook({
          accessId: 'doesntmatter',
          url: url,
          webhooksStorage: storage,
          user: user,
        });
        await webhook.save();
        requestTimestamp = timestamp.now();
        await webhook.send(message);
        runs = webhook.runs;
        storedWebhook = await bluebird.fromCallback(
          cb => storage.findOne(user, { id: { $eq: webhook.id } }, {}, cb)
        );
      });

      it('should send it', () => {
        assert.equal(notificationsServer.getMessages()[0], message, 'Webhook sent wrong message.');
      });
      it('should add a log to runs', () => {
        assert.equal(runs.length, 1);
        assert.equal(storedWebhook.runs.length, 1);
      });
      it('should add the correct status to the last run', () => {
        assert.equal(runs[0].status, 200);
        assert.equal(storedWebhook.runs[0].status, 200);
      });
      it('should add the correct timestamp to the last run', () => {
        assert.approximately(runs[0].timestamp, requestTimestamp, 0.5, 'Timestamp is unsynced.');
        assert.approximately(storedWebhook.runs[0].timestamp, requestTimestamp, 0.5, 'Timestamp is unsynced.');
      });
      it('should increment runCount', () => {
        assert.equal(webhook.runCount, 1);
        assert.equal(storedWebhook.runCount, 1);
      });
      it('should not increment failCount', () => {
        assert.equal(webhook.failCount, 0);
        assert.equal(storedWebhook.failCount, 0);
      });

    });

    describe('when sending to an unexistant endpoint', () => {

      let webhook, runs, requestTimestamp,
        storedWebhook;

      before(async () => {
        webhook = new Webhook({
          accessId: 'doesnmatter',
          url: 'unexistant',
          webhooksStorage: storage,
          user: user,
        });
        await webhook.save();
        requestTimestamp = timestamp.now();
        await webhook.send('doesntmatter');
        storedWebhook = await bluebird.fromCallback(
          cb => storage.findOne(user, { id: { $eq: webhook.id } }, {}, cb)
        );
      });

      after(() => {
        webhook.stop();
      });

      it('should add a log to runs', () => {
        assert.equal(webhook.runs.length, 1);
        assert.equal(storedWebhook.runs.length, 1);
      });
      it('should add the no status to the last run', () => {
        assert.equal(webhook.runs[0].status, 0);
        assert.equal(storedWebhook.runs[0].status, 0);
      });
      it('should add the correct timestamp to the last run', () => {
        assert.approximately(webhook.runs[0].timestamp, requestTimestamp, 0.5, 'Timestamp is unsynced.');
        assert.approximately(storedWebhook.runs[0].timestamp, requestTimestamp, 0.5, 'Timestamp is unsynced.');
      });
      it('should increment runCount', () => {
        assert.equal(webhook.runCount, 1, 'runCount should be 1');
        assert.equal(storedWebhook.runCount, 1, 'runCount should be 1');
      });
      it('should increment failCount', () => {
        assert.equal(webhook.failCount, 1, 'failCount should be 1');
        assert.equal(storedWebhook.failCount, 1, 'failCount should be 1');
      });
      it('should increment currentRetries', () => {
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

        let webhook, run, requestTimestamp, storedWebhook;
        const firstMessage = 'hello';
        const secondMessage = 'hello2';

        before(async () => {
          webhook = new Webhook({
            accessId: 'doesntmatter',
            url: url,
            minIntervalMs: 100,
            webhooksStorage: storage,
            user: user,
          });
          await webhook.save();
          requestTimestamp = timestamp.now();
          await webhook.send(firstMessage);
          run = webhook.runs[0];
          storedWebhook = await bluebird.fromCallback(
            cb => storage.findOne(user, { id: { $eq: webhook.id } }, {}, cb)
          );
          storedRun = storedWebhook.runs[0];
        });

        it('should save the run', () => {
          assert.equal(run.status, 503);
          assert.approximately(run.timestamp, requestTimestamp, 0.1);
          assert.deepEqual(run, webhook.lastRun);
          assert.equal(storedRun.status, 503);
          assert.approximately(storedRun.timestamp, requestTimestamp, 0.1);
          assert.deepEqual(storedRun, storedWebhook.lastRun);
        });
        it('should increment currentRetries', () => {
          assert.equal(webhook.currentRetries, 1);
          assert.equal(storedWebhook.currentRetries, 1);
        });
        it('should schedule for a retry', () => {
          assert.exists(webhook.timeout);
          //webhook.send(secondMessage);
        });
        it('should send scheduled messages after an interval', async () => {
          notificationsServer.setResponseStatus(201);
          await new bluebird((resolve, reject) => {
            notificationsServer.on('received', resolve);
            notificationsServer.on('close', () => { });
            notificationsServer.on('error', reject);
          });
          assert.isTrue(notificationsServer.isMessageReceived());
          // firstMessage is received the first time although it returns a 503.
          assert.deepEqual(notificationsServer.getMessages(),
            [firstMessage, firstMessage]);

        });
        it('should reset error tracking properties', async () => {
          storedWebhook = await bluebird.fromCallback(
            cb => storage.findOne(user, { id: { $eq: webhook.id } }, {}, cb)
          );
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
          webhooksStorage: storage,
          user: user,
        });
        await webhook.save();
        await webhook.send(firstMessage);
        await webhook.send(firstMessage);
        await webhook.send(secondMessage);
        await webhook.send(thirdMessage);
        runs = webhook.runs;
        storedWebhook = await bluebird.fromCallback(
            cb => storage.findOne(user, { id: { $eq: webhook.id } }, {}, cb)
          );
      });

      it('should only send the message once', () => {
        assert.equal(notificationsServer.getMessageCount(), 1, 'server should receive the message once');
        assert.equal(runs.length, 1, 'Webhook should have 1 run');
        assert.equal(storedWebhook.runs.length, 1, 'Webhook should have 1 run');
      });
      it('should accumulate messages', () => {
        assert.deepEqual(webhook.getMessageBuffer(), 
          [firstMessage, secondMessage, thirdMessage]);
      });
      it('should schedule for a retry after minInterval', () => {
        assert.exists(webhook.timeout);
      });
      it('should send scheduled messages after an interval', async () => {
        await new bluebird((resolve, reject) => {
          notificationsServer.on('received', resolve);
          notificationsServer.on('close', () => { });
          notificationsServer.on('error', reject);
        });
        assert.isTrue(notificationsServer.isMessageReceived());
        assert.deepEqual(notificationsServer.getMessages(), 
          [firstMessage, firstMessage, secondMessage, thirdMessage]);
      });
      it('should remove the timeout afterwards', () => {
        assert.notExists(webhook.timeout);
      });

    });
  });
});