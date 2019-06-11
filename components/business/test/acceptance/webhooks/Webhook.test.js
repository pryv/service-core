/*global describe, it, before, after*/

const assert = require('chai').assert;
const timestamp = require('unix-timestamp');
const bluebird = require('bluebird');

const Webhook = require('../../../src/webhooks/Webhook');

const HttpServer = require('./support/httpServer');

const PORT = 6123;

describe('Webhook', () => {

  describe('send()', () => {

    let notificationsServer;
    const postPath = '/notifications';
    const url = 'http://localhost:' + PORT + postPath;

    describe('when sending to an existing endpoint', () => {

      before(async () => {
        notificationsServer = new HttpServer(postPath, 200);
        await notificationsServer.listen();
      });

      after(() => {
        notificationsServer.close();
      });

      let webhook, runs, message, requestTimestamp;

      before(async () => {
        message = 'hi';
        webhook = new Webhook({
          accessId: 'doesntmatter',
          url: url,
        });
        requestTimestamp = timestamp.now();
        await webhook.send(message);
        runs = webhook.runs;
      });

      it('should send it', () => {
        assert.equal(notificationsServer.getMessages()[0], message, 'Webhook sent wrong message.');
      });
      it('should add a log to runs', () => {
        assert.equal(runs.length, 1);
      });
      it('should add the correct status to the last run', () => {
        assert.equal(runs[0].status, 200);
      });
      it('should add the correct timestamp to the last run', () => {
        assert.approximately(runs[0].timestamp, requestTimestamp, 0.5, 'Timestamp is unsynced.');
      });
      it('should increment runCount', () => {
        assert.equal(webhook.runCount, 1);
      });
      it('should not increment failCount', () => {
        assert.equal(webhook.failCount, 0);
      });

    });

    describe('when sending to an unexistant endpoint', () => {

      let webhook, runs, requestTimestamp;

      before(async () => {
        webhook = new Webhook({
          accessId: 'doesnmatter',
          url: 'unexistant'
        });
        requestTimestamp = timestamp.now();
        await webhook.send('doesntmatter');
        runs = webhook.runs;
      });

      after(() => {
        webhook.stop();
      });

      it('should add a log to runs', () => {
        assert.equal(runs.length, 1);
      });
      it('should add the no status to the last run', () => {
        assert.equal(runs[0].status, 0);
      });
      it('should add the correct timestamp to the last run', () => {
        assert.approximately(runs[0].timestamp, requestTimestamp, 0.5, 'Timestamp is unsynced.');
      });
      it('should increment runCount', () => {
        assert.equal(webhook.runCount, 1, 'runCount should be 1');
      });
      it('should increment failCount', () => {
        assert.equal(webhook.failCount, 1, 'failCount should be 1');
      });
      it('should increment currentRetries', () => {
        assert.equal(webhook.currentRetries, 1);
      });

    });

    describe('when scheduling for a retry', () => {

      describe('when the notifications service is down', async () => {

        before(async () => {
          notificationsServer = new HttpServer(postPath, 503);
          await notificationsServer.listen();
        });

        after(() => {
          webhook.stop();
          notificationsServer.close();
        });

        let webhook, run, requestTimestamp;
        const firstMessage = 'hello';
        const secondMessage = 'hello2';

        before(async () => {
          webhook = new Webhook({
            accessId: 'doesntmatter',
            url: url,
            minIntervalMs: 100,
          });
          requestTimestamp = timestamp.now();
          await webhook.send(firstMessage);
          run = webhook.runs[0];
        });

        it('should save the run', () => {
          assert.equal(run.status, 503);
          assert.approximately(run.timestamp, requestTimestamp, 0.1);
        });
        it('should increment currentRetries', () => {
          assert.equal(webhook.currentRetries, 1);
        });
        it('should schedule for a retry after minInterval', () => {
          assert.exists(webhook.timeout);
          webhook.send(secondMessage);
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
            [firstMessage, firstMessage, secondMessage]);
        });
        it('should remove the timeout afterwards', () => {
          assert.notExists(webhook.timeout);
        });
        
      });
    });

    describe('when throttling frequent calls', () => {
      
      before(async () => {
        notificationsServer = new HttpServer(postPath, 200);
        await notificationsServer.listen();
      });

      after(() => {
        webhook.stop();
        notificationsServer.close();
      });

      let webhook, runs;
        
      const firstMessage = 'hello';
      const secondMessage = 'hello2';
      const thirdMessage = 'hello3';

      before(async () => {
        webhook = new Webhook({
          accessId: 'doesntmatter',
          url: url,
          minIntervalMs: 100,
        });
        await webhook.send(firstMessage);
        await webhook.send(firstMessage);
        await webhook.send(secondMessage);
        await webhook.send(thirdMessage);
        runs = webhook.runs;
      });

      it('should only send the message once', () => {
        assert.equal(notificationsServer.getMessageCount(), 1, 'server should receive the message once');
        assert.equal(runs.length, 1, 'Webhook should have 1 run');
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