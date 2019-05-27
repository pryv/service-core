/*global describe, it, before, after*/

const assert = require('chai').assert;

const Webhook = require('../../../src/webhooks/Webhook');

const HttpServer = require('./support/httpServer');

const PORT = 6123;

describe('Webhook', () => {

  describe('send()', () => {

    let notificationsServer;
    const postPath = '/notifications';
    const url = 'http://localhost:' + PORT + postPath;

    before(async () => {
      notificationsServer = new HttpServer(postPath, 200);
      await notificationsServer.listen();
    });

    after(() => {
      notificationsServer.close();
    });

    it('should send a message to the provided URL', async () => {
      const message = 'hi';
      const webhook = new Webhook({
        accessId: 'doesntmatter',
        url: url,
      });
      await webhook.send(message);
      assert.equal(notificationsServer.getMessage().message, message, 'Webhook sent wrong message.');
      const runs = webhook.runs;
      assert.equal(runs.length, 1);
      assert.equal(runs[0].statusCode, 200);
      assert.equal(webhook.runCount, 1);
      assert.equal(webhook.failCount, 0);
    });

    it('should note failures correctly', async () => {
      const webhook = new Webhook({
        accessId: 'doesnmatter',
        url: 'unexistant'
      });
      await webhook.send('doesntmatter');
      const runs = webhook.runs;
      assert.equal(runs.length, 1);
      assert.equal(runs[0].statusCode, 0);
      assert.equal(webhook.runCount, 1, 'runCount should be 1');
      assert.equal(webhook.failCount, 1, 'failCount should be 1');
    });
  });
});