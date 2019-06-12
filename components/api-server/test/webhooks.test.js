/*global describe, it, before, after */

const cuid = require('cuid');
const bluebird = require('bluebird');
const timestamp = require('unix-timestamp');
const chai = require('chai');
const assert = chai.assert;

const helpers = require('./helpers');
const { databaseFixture } = require('components/test-helpers');
const { produceMongoConnection, context } = require('./test-helpers');
const validation = helpers.validation;
const methodsSchema = require('../src/schema/webhooksMethods');

const { ErrorIds } = require('components/errors/src');
const storage = require('components/test-helpers').dependencies.storage.user.webhooks;

const { Webhook } = require('components/business/src/webhooks');

describe('webhooks', () => {

  const mongoFixtures = databaseFixture(produceMongoConnection());
  after(() => {
    mongoFixtures.clean();
  });

  let username, personalAccessToken, 
      appAccessToken1, appAccessToken2,
      appAccessId1, appAccessId2,
      sharedAccessToken,
      webhookId1, webhookId2;
  before(() => {
    username = cuid();
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
      
      let webhooks, response;
      before(async () => {
        const res = await server.request()
          .get(`/${username}/webhooks`)
          .set('Authorization', appAccessToken1);
        response = res;
        webhooks = res.body.webhooks;
      });

      it('should return a status 200 with a webhooks object which is an array', () => {
        validation.check(response, {
          schema: methodsSchema.get.result,
          status: 200,
        });
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

      let response;
      before(async () => {
        const res = await server.request()
          .get(`/${username}/webhooks`)
          .set('Authorization', sharedAccessToken);
        response = res;
      });

      it('should return a status 403 with a forbidden error', () => {
        validation.checkErrorForbidden(response);
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
        }, appAccessId2);
      });
    });

    after(async () => {
      await mongoFixtures.clean();
    });

    describe('when using an app token', () => {

      describe('when fetching an existing webhook inside its scope', () => {

        let response;
        before(async () => {
          const res = await server.request()
            .get(`/${username}/webhooks/${webhookId1}`)
            .set('Authorization', appAccessToken1);
          response = res;
        });

        it('should return a status 200 with a webhook object', () => {
          validation.check(response, {
            schema: methodsSchema.getOne.result,
            status: 200,
          });
        });
      });

      describe('when fetching an existing webhook outside of its scope', () => {

        let response;
        before(async () => {
          const res = await server.request()
            .get(`/${username}/webhooks/${webhookId2}`)
            .set('Authorization', appAccessToken1);
          response = res;
        });

        it('should return a status 403 with a forbidden error', () => {
          validation.checkErrorForbidden(response);
        });
      });

      describe('when fetching an unexistant webhook', () => {

        let response;
        before(async () => {
          const res = await server.request()
            .get(`/${username}/webhooks/doesnotexist`)
            .set('Authorization', appAccessToken1);
          response = res;
        });

        it('should return a status 404 with a unknown resource error', () => {
          validation.checkErrorUnknown(response);
        });
      });
    
    });

    describe('when using a personnal token', () => {

      let response;
      before(async () => {
        const res = await server.request()
          .get(`/${username}/webhooks/${webhookId2}`)
          .set('Authorization', personalAccessToken);
        response = res;
      });

      it('should return a status 200 with a webhook object', () => {
        validation.check(response, {
          schema: methodsSchema.getOne.result,
          status: 200,
        });
      });
    });

    describe('when using a shared token', () => {

      let response;
      before(async () => {
        const res = await server.request()
          .get(`/${username}/webhooks/doesnotmatter`)
          .set('Authorization', sharedAccessToken);
        response = res;
      });

      it('should return a status 403 with a forbidden error', () => {
        validation.checkErrorForbidden(response);
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
        let webhook, response;
        before(async () => {
          const res = await server.request()
            .post(`/${username}/webhooks`)
            .set('Authorization', appAccessToken1)
            .send({ url: url });
          response = res;
          webhook = new Webhook({
            accessId: appAccessId1,
            url: url,
            id: res.body.webhook.id,
          }).forApi();
        });

        it('should return a status 201 with the created webhook', () => {
          validation.check(response, {
            status: 201,
            schema: methodsSchema.create.result,
            data: webhook,
            sanitizeFn: validation.removeTrackingPropertiesForOne,
            sanitizeTarget: 'webhook',
          });
        });
        it('should save it to the storage', async () => {
          const storedWebhook = await bluebird.fromCallback((cb) =>
            storage.findOne({ id: username}, { accessId: { $eq: appAccessId1 } }, {}, cb)
          );
          assert.deepEqual(validation.removeTrackingPropertiesForOne(storedWebhook), 
            validation.removeTrackingPropertiesForOne(webhook));
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

        it('should return an error');

      });
      
      describe('when maxRetries is bigger that the allowed maxmum', () => {

        it('should return an error');

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

          let response, webhook;
          before(async () => {
            const res = await server.request()
              .put(`/${username}/webhooks/${webhookId1}`)
              .set('Authorization', appAccessToken1)
              .send({
                state: 'inactive',
              });
            response = res;
            webhook = new Webhook({
              accessId: appAccessId1,
              url: url,
              id: webhookId1,
              minIntervalMs: minIntervalMs,
              maxRetries: maxRetries,
              state: 'inactive',
            }).forApi();
          });

          it('should return a status 200 with the updated webhook', () => {
            validation.check(response, {
              status: 200,
              schema: methodsSchema.update.result,
              data: webhook,
              sanitizeFn: validation.removeTrackingPropertiesForOne,
              sanitizeTarget: 'webhook',
            });
          });
          it('should apply the changes to the storage', async () => {
            const storedWebhook = await bluebird.fromCallback((cb) =>
              storage.findOne({ id: username }, { id: { $eq: webhookId1 } }, {}, cb)
            );
            assert.deepEqual(validation.removeTrackingPropertiesForOne(storedWebhook),
              validation.removeTrackingPropertiesForOne(webhook));
          });
        });

        describe('when changing a readonly parameter', () => {

          let webhook, status, error;
          before(async () => {
            const res = await server.request()
              .put(`/${username}/webhooks/${webhookId1}`)
              .set('Authorization', appAccessToken1)
              .send({
                lastRun: {
                  status: 201,
                  timestamp: timestamp.now(),
                }
              });
            webhook = res.body.webhook;
            status = res.status;
            error = res.body.error;
          });

          it('should return a 403 status', () => {
            assert.equal(status, 403);
          });

          it('should return an error object', () => {
            assert.exists(error);
            assert.isObject(error);
            assert.notExists(webhook);
          });

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