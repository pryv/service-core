/*global describe, it, before, after */

const cuid = require('cuid');
const bluebird = require('bluebird');
const chai = require('chai');
const assert = chai.assert;

const helpers = require('./helpers');
const { databaseFixture } = require('components/test-helpers');
const { produceMongoConnection, context } = require('./test-helpers');

const { ErrorIds } = require('components/errors/src');
const storage = require('components/test-helpers').dependencies.storage.user.webhooks;

describe('webhooks', () => {

  const mongoFixtures = databaseFixture(produceMongoConnection());
  after(() => {
    mongoFixtures.clean();
  });

  let username, streamId, personalAccessToken, 
      appAccessToken1, appAccessToken2,
      appAccessId1, appAccessId2,
      sharedAccessToken,
      webhookId1, webhookId2;
  before(() => {
    username = cuid();
    streamId = cuid();
    personalAccessToken = cuid();
    appAccessToken1 = cuid();
    appAccessToken2 = cuid();
    appAccessId1 = cuid();
    appAccessId2 = cuid();
    sharedAccessToken = cuid();
  });

  let server;
  before(async () => {
    server = await context.spawn();
  });
  after(() => {
    server.stop();
  });

  describe('GET /', () => {

    before(() => {
      return mongoFixtures.user(username, {}, async (user) => {
        user.access({
          type: 'personal', token: personalAccessToken,
        });
        user.access({
          id: appAccessId1,
          type: 'app', token: appAccessToken1,
        });
        user.access({
          id: appAccessId2,
          type: 'app', token: appAccessToken2,
        });
        user.access({
          type: 'shared', token: sharedAccessToken, 
        });

        user.session(personalAccessToken);
        user.webhook({}, appAccessId1);
        user.webhook({}, appAccessId2);
      });
    });
    
    after(async () => {
      await mongoFixtures.clean();
    });

    describe('when using an app token', () => {
      
      let webhooks, status;
      before(async () => {
        const res = await server.request()
          .get(`/${username}/webhooks`)
          .set('Authorization', appAccessToken1);
        webhooks = res.body.webhooks;
        status = res.status;
      });

      it('should return a status 200', () => {
        assert.equal(status, 200);
      });
      it('should return a webhooks object which is an array', () => {
        assert.exists(webhooks);
        assert.typeOf(webhooks, 'Array');
      });
      it('should fetch all webhooks reachable by an app token', () => {
        webhooks.forEach(w => {
          assert.equal(w.accessId, appAccessId1);
        });
      });
      it('should not fetch any Webhook outside its scope', () => {
        webhooks.forEach(w => {
          assert.notEqual(w.accessId, appAccessId2);
        });
      });
    });
    
    describe('when using a personal token', () => {

      let webhooks;
      before(async () => {
        const res = await server.request()
          .get(`/${username}/webhooks`)
          .set('Authorization', personalAccessToken);
        webhooks = res.body.webhooks;
      });

      it('should fetch all webhooks for the user', () => {
        let found1 = false;
        let found2 = false; 
        webhooks.forEach(w => {
          if (w.accessId === appAccessId1) {
            found1 = true;
          } 
          if (w.accessId === appAccessId2) {
            found2 = true;
          } 
        });
        assert.isTrue(found1, 'did not find webhook1');
        assert.isTrue(found2, 'did not find webhook2');
      });
    });

    describe('when using a shared token', () => {

      let webhooks, error, status;
      before(async () => {
        const res = await server.request()
          .get(`/${username}/webhooks`)
          .set('Authorization', sharedAccessToken);
        webhooks = res.body.webhooks;
        error = res.body.error;
        status = res.status;
      });

      it('should return a status 403 forbidden', () => {
        assert.equal(status, 403);
      });
      it('should return an error object', () => {
        assert.notExists(webhooks);
        assert.exists(error);
        assert.typeOf(error, 'Object');
      });
      it('error should say that it is forbidden to use a shared access', () => {
        assert.equal(error.id, ErrorIds.Forbidden);
      });
    });
    
  });

  describe('GET /:webhookId', () => {

    const url = 'yololo';
    const minIntervalMs = 10000;
    const maxRetries = 5;

    before(() => {
      personalAccessToken = cuid();
      appAccessId1 = cuid();
      appAccessToken1 = cuid();
      sharedAccessToken = cuid();
      webhookId1 = cuid();
      webhookId2 = cuid();
    });

    before(() => {
      return mongoFixtures.user(username, {}, async (user) => {
        user.access({
          type: 'personal', token: personalAccessToken,
        });
        user.access({
          id: appAccessId1,
          type: 'app', token: appAccessToken1,
        });
        user.access({
          type: 'shared', token: sharedAccessToken,
        });
        user.session(personalAccessToken);
        user.webhook({
          id: webhookId1,
          url: url,
          minIntervalMs: minIntervalMs,
          maxRetries: maxRetries,
        }, appAccessId1);
        user.webhook({
          id: webhookId2,
        });
      });
    });

    after(async () => {
      await mongoFixtures.clean();
    });

    describe('when using an app token', () => {

      describe('when fetching an existing webhook inside its scope', () => {

        let webhook, status;
        before(async () => {
          const res = await server.request()
            .get(`/${username}/webhooks/${webhookId1}`)
            .set('Authorization', appAccessToken1);
          webhook = res.body.webhook;
          status = res.status;
        });

        it('should return a status 200', () => {
          assert.equal(status, 200);
        });
        it('should return a webhook object', () => {
          assert.exists(webhook);
          assert.typeOf(webhook, 'Object');
        });
        it('should have correct fields', () => {
          assert.equal(webhook.id, webhookId1);
          assert.equal(webhook.url, url);
          assert.equal(webhook.state, 'active');
          assert.equal(webhook.minIntervalMs, minIntervalMs);
          assert.equal(webhook.maxRetries, maxRetries);
          assert.equal(webhook.currentRetries, 0);
          assert.deepEqual(webhook.runs, []);
          assert.deepEqual(webhook.lastRun, { status: 0, timestamp: 0});
          assert.equal(webhook.runCount, 0);
          assert.equal(webhook.failCount, 0);
        });
        it('should not have internal fields', () => {
          assert.notExists(webhook.timeout);
          assert.notExists(webhook.user);
          assert.notExists(webhook.NatsSubscriber);
          assert.notExists(webhook.messageBuffer);
          assert.notExists(webhook.storage);
        });
      });

      describe('when fetching an existing webhook outside of its scope', () => {

        let webhook, status, error;
        before(async () => {
          const res = await server.request()
            .get(`/${username}/webhooks/${webhookId2}`)
            .set('Authorization', appAccessToken1);
          webhook = res.body.webhook;
          status = res.status;
          error = res.body.error;
        });

        it('should return a status 403', () => {
          assert.equal(status, 403);
        });
        it('should return an error object', () => {
          assert.notExists(webhook);
          assert.exists(error);
          assert.typeOf(error, 'Object');
        });
        it('error should say that it is forbidden', () => {
          assert.equal(error.id, ErrorIds.Forbidden);
        });
      });

      describe('when fetching an unexistant webhook', () => {

        let webhook, status, error;
        before(async () => {
          const res = await server.request()
            .get(`/${username}/webhooks/doesnotexist`)
            .set('Authorization', appAccessToken1);
          webhook = res.body.webhook;
          status = res.status;
          error = res.body.error;
        });

        it('should return a status 404 not found', () => {
          assert.equal(status, 404);
        });
        it('should return an error object', () => {
          assert.notExists(webhook);
          assert.exists(error);
          assert.typeOf(error, 'Object');
        });
        it('error should say that it is an unknown id', () => {
          assert.equal(error.id, ErrorIds.UnknownResource);
        });
      });
    
    });

    describe('when using a personnal token', () => {

      let webhook, status;
      before(async () => {
        const res = await server.request()
          .get(`/${username}/webhooks/${webhookId2}`)
          .set('Authorization', personalAccessToken);
        webhook = res.body.webhook;
        status = res.status;
      });

      it('should return a status 200', () => {
        assert.equal(status, 200);
      });
      it('should return a webhook object', () => {
        assert.exists(webhook);
        assert.typeOf(webhook, 'Object');
      });
    });

    describe('when using a shared token', () => {

      let webhook, status, error;
      before(async () => {
        const res = await server.request()
          .get(`/${username}/webhooks/doesnotmatter`)
          .set('Authorization', sharedAccessToken);
        webhook = res.body.webhook;
        status = res.status;
        error = res.body.error;
      });

      it('should return a status 403 forbidden', () => {
        assert.equal(status, 403);
      });
      it('should return an error object', () => {
        assert.notExists(webhook);
        assert.exists(error);
        assert.typeOf(error, 'Object');
      });
      it('error should say that it is forbidden to use a shared access', () => {
        assert.equal(error.id, ErrorIds.Forbidden);
      });

    });
    
  });

  describe('POST /', () => {

    before(async () => {
      await mongoFixtures.clean();
      username = cuid();
      personalAccessToken = cuid();
      appAccessId1 = cuid();
      appAccessToken1 = cuid();
      sharedAccessToken = cuid();
    });

    before(() => {
      return mongoFixtures.user(username, {}, async (user) => {
        user.access({
          type: 'personal', token: personalAccessToken,
        });
        user.access({
          id: appAccessId1,
          type: 'app', token: appAccessToken1,
        });
        user.access({
          type: 'shared', token: sharedAccessToken,
        });

        user.session(personalAccessToken);
      });
    });

    describe('when providing a valid webhook', () => {
      
      describe('when using an App Access', () => {

        const url = 'https://somecompany.com/notifications';
        let webhook, status;
        before(async () => {
          const res = await server.request()
            .post(`/${username}/webhooks`)
            .set('Authorization', appAccessToken1)
            .send({ url: url });
          webhook = res.body.webhook;
          status = res.status;
        });

        it('should return a status 201', () => {
          assert.equal(status, 201);
        });
        it('should return a webhook field which is an object', () => {
          assert.exists(webhook);
          assert.typeOf(webhook, 'Object');
        });
        it('should have the correct url', () => {
          assert.equal(webhook.url, url);
        });
        it('should fill its fields with default data', () => {
          assert.equal(webhook.accessId, appAccessId1);
          assert.equal(webhook.maxRetries, 5);
          assert.equal(webhook.minIntervalMs, 5000);
          assert.equal(webhook.runCount, 0);
          assert.equal(webhook.failCount, 0);
          assert.typeOf(webhook.runs, 'Array');
          assert.equal(webhook.runs.length, 0);
          assert.equal(webhook.currentRetries, 0);
          assert.equal(webhook.state, 'active');
          assert.exists(webhook.created);
          assert.exists(webhook.createdBy);
          assert.exists(webhook.modified);
          assert.exists(webhook.modifiedBy);
        });
        it('should save it to the storage', async () => {
          const retrievedWebhook = await bluebird.fromCallback((cb) =>
            storage.findOne({ id: username}, { accessId: { $eq: appAccessId1 } }, {}, cb)
          );
          assert.deepEqual(retrievedWebhook, webhook);
        });
      });

      describe('when using a Shared Access', () => {
        let webhook, error, status;
        before(async () => {
          const res = await server.request()
            .post(`/${username}/webhooks`)
            .set('Authorization', sharedAccessToken)
            .send({ url: 'doesntmatter' });
          error = res.body.error;
          webhook = res.body.webhook;
          status = res.status;
        });

        it('should return a status 403', () => {
          assert.equal(status, 403);
        });
        it('should return an error object as it is forbidden', () => {
          assert.notExists(webhook);
          assert.exists(error);
        });
        it('error should say that it is forbidden to use a Shared Access', () => {
          assert.equal(error.id, ErrorIds.Forbidden);
        });
      });

      describe('when using a Personal Access', () => {
        let webhook, error, status;
        before(async () => {
          const res = await server.request()
            .post(`/${username}/webhooks`)
            .set('Authorization', personalAccessToken)
            .send({ url: 'doesntmatter' });
          error = res.body.error;
          webhook = res.body.webhook;
          status = res.status;
        });

        it('should return a status 403', () => {
          assert.equal(status, 403);
        });
        it('should return an error object as it is forbidden', () => {
          assert.notExists(webhook);
          assert.exists(error);
        });
        it('error should say that it is forbidden to use a Personal Access', () => {
          assert.equal(error.id, ErrorIds.Forbidden);
        });
      });
    });

    describe('when providing an existing url', () => {

      const url = 'https://existing.com/notifications';
      
      before(() => {
        mongoFixtures.clean();
        username = cuid();
        appAccessId1 = cuid();
        appAccessToken1 = cuid();
      });

      before(() => {
        return mongoFixtures.user(username, {}, async (user) => {
          user.access({
            id: appAccessId1,
            type: 'app', token: appAccessToken1,
          });
          user.webhook({ url: url }, appAccessId1);
        });
      });

      let webhook, error, status;
      before(async () => {
        const res = await server.request()
          .post(`/${username}/webhooks`)
          .set('Authorization', appAccessToken1)
          .send({ url: url });
        webhook = res.body.webhook;
        error = res.body.error;
        status = res.status;
      });

      it('should return a status 400', () => {
        assert.equal(status, 400);
      });
      it('should contain an error field', () => {
        assert.exists(error);
        assert.notExists(webhook);
      });
      it('error should indicate that there is a collision', () => {
        assert.equal(error.id, ErrorIds.ItemAlreadyExists);
      });
    });

    describe('when providing invalid parameters', () => {

      describe('when url is not a string', () => {

        const url = 123;

        before(() => {
          mongoFixtures.clean();
          username = cuid();
          appAccessId1 = cuid();
          appAccessToken1 = cuid();
        });

        before(() => {
          return mongoFixtures.user(username, {}, async (user) => {
            user.access({
              id: appAccessId1,
              type: 'app', token: appAccessToken1,
            });
            user.webhook({ url: 'someurl' }, appAccessId1);
          });
        });

        let webhook, error, status;
        before(async () => {
          const res = await server.request()
            .post(`/${username}/webhooks`)
            .set('Authorization', appAccessToken1)
            .send({ url: url });
          webhook = res.body.webhook;
          error = res.body.error;
          status = res.status;
        });

        it('should return a status 400', () => {
          assert.equal(status, 400);
        });
        it('should contain an error field', () => {
          assert.exists(error);
          assert.notExists(webhook);
        });
        it('error should indicate that parameters are invalid', () => {
          assert.equal(error.id, ErrorIds.InvalidParametersFormat);
        });
      });

      describe('when minIntervalMs is smaller that the system minimum', () => {

      });
      
      describe('when maxRetries is bigger that the allowed maxmum', () => {

      });

      
    });

  });

  describe('PUT /:webhookId', () => {

    const url = 'yololo';
    const minIntervalMs = 10000;
    const maxRetries = 5;

    before(() => {
      personalAccessToken = cuid();
      appAccessId1 = cuid();
      appAccessToken1 = cuid();
      sharedAccessToken = cuid();
      webhookId1 = cuid();
      webhookId2 = cuid();
    });

    before(() => {
      return mongoFixtures.user(username, {}, async (user) => {
        user.access({
          type: 'personal', token: personalAccessToken,
        });
        user.access({
          id: appAccessId1,
          type: 'app', token: appAccessToken1,
        });
        user.access({
          type: 'shared', token: sharedAccessToken,
        });
        user.session(personalAccessToken);
        user.webhook({
          id: webhookId1,
          url: url,
          minIntervalMs: minIntervalMs,
          maxRetries: maxRetries,
        }, appAccessId1);
        user.webhook({
          id: webhookId2,
        });
      });
    });

    after(async () => {
      await mongoFixtures.clean();
    });

    describe('when using an app token', () => {

      describe('when updating an existing webhook', () => {

        describe('when changing a valid parameter', () => {

          let webhook, status;
          before(async () => {
            const res = await server.request()
              .put(`/${username}/webhooks/${webhookId1}`)
              .set('Authorization', appAccessToken1)
              .send({
                state: 'inactive',
              });
            webhook = res.body.webhook;
            status = res.status;
          });

          it('should return a status 200', () => {
            assert.equal(status, 200);
          });
          it('should return a webhook object', () => {
            assert.exists(webhook);
            assert.typeOf(webhook, 'Object');
          });
          it('should apply the changes to the return webhook', () => {
            assert.equal(webhook.id, webhookId1);
            assert.equal(webhook.url, url);
            assert.equal(webhook.minIntervalMs, minIntervalMs);
            assert.equal(webhook.maxRetries, maxRetries);
            assert.equal(webhook.currentRetries, 0);
            assert.equal(webhook.state, 'inactive');
            assert.deepEqual(webhook.runs, []);
            assert.deepEqual(webhook.lastRun, { status: 0, timestamp: 0 });
            assert.equal(webhook.runCount, 0);
            assert.equal(webhook.failCount, 0);
          });
          it('should apply the changes to the storage', async () => {
            const retrievedWebhook = await bluebird.fromCallback((cb) =>
              storage.findOne({ id: username }, { id: { $eq: webhookId1 } }, {}, cb)
            );
            assert.deepEqual(retrievedWebhook, webhook);
          });
        });

        describe('when changing a readonly parameter', () => {

          it('should return a 403 status');

          it('should return an error object');

          it('should return an error ');

        });

      });

      describe('when updating an unexistant webhook', () => {


      });
    });

    describe('when using a personal token', () => {


    });

    describe('when using a shared token', () => {

    });

    it('should activate a deactivated hook');

    it('should fail if the webhook does not exist');

    it('should fail if the webhook outside of the token\'s rights');

    it('should fail if maxRetries is too low');

    it('should fail if minIntervalMs is too low');
  });

  describe('DELETE /:webhookId', () => {
    it('should delete a webhook');

    it('should fail if the webhook does not exist');

    it('should fail if the webhook outside of the token\'s rights');

    it('should fail if the webhook is already deleted');
  });

  describe('POST /:webhookId/test', () => {
    it('should send a POST request to the url of the webhook');

    it('should fail if the webhook does not exist');

    it('should fail if the webhook outside of the token\'s rights');
  });
});