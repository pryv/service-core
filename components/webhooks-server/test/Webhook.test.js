/*global describe, it, before, after*/

const assert = require('chai').assert;

const Webhook = require('../src/Webhook');

const HttpServer = require('./support/httpServer');

const PORT = 6123;

describe('Webhook', () => {

  describe('send()', () => {

    let notificationsServer;
    const postPath = '/notifications';
    const url = 'http://localhost:' + PORT + postPath;

    before((done) => {
      notificationsServer = new HttpServer(postPath, 200);
      notificationsServer.listen(done);
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
      const runs = webhook.runsArray;
      assert.equal(runs.length, 1);
      assert.equal(runs[0].statusCode, 200);
      assert.equal(webhook.runCount, 1);
    });
  });
});