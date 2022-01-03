/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/*global describe, it, before, after */

const cuid = require('cuid');
const bluebird = require('bluebird');
const timestamp = require('unix-timestamp');
const chai = require('chai');
const assert = chai.assert;
const charlatan = require('charlatan');

const helpers = require('./helpers');
const { databaseFixture } = require('test-helpers');
const { produceMongoConnection, context } = require('./test-helpers');
const validation = helpers.validation;
const methodsSchema = require('../src/schema/webhooksMethods');
const HttpServer = require('business/test/acceptance/webhooks/support/httpServer');

const { ErrorIds } = require('errors/src');
const storage = require('test-helpers').dependencies.storage.user.webhooks;
const { Webhook } = require('business').webhooks;

describe('webhooks', () => {

  let mongoFixtures;
  before(async function () {
    mongoFixtures = databaseFixture(await produceMongoConnection());
  });
  after(() => {
    mongoFixtures.clean();
  });

  let username, personalAccessToken, 
      appAccessToken1, appAccessToken2,
      appAccessId1, appAccessId2,
      sharedAccessToken,
      sharedAccessId,
      webhookId1, webhookId2, webhookId3, webhookId4;
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
      return mongoFixtures.user(username, {}, (user) => {
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

      it('[R5KD] should return a status 200 with a webhooks object which is an array', () => {
        validation.check(response, {
          schema: methodsSchema.get.result,
          status: 200,
        });
      });
      it('[67CX] should fetch all webhooks reachable by an app token', () => {
        webhooks.forEach(w => {
          assert.equal(w.accessId, appAccessId1);
        });
      });
      it('[WSJG] should not fetch any Webhook outside its scope', () => {
        webhooks.forEach(w => {
          assert.notEqual(w.accessId, appAccessId2);
        });
      });
    });
    
    describe('when using a personal token', () => {

      let webhooks, response;
      before(async () => {
        const res = await server.request()
          .get(`/${username}/webhooks`)
          .set('Authorization', personalAccessToken);
        response = res;
        webhooks = res.body.webhooks;
      });

      it('[6MNC] should return a status 200 with a webhooks object which is an array', () => {
        validation.check(response, {
          schema: methodsSchema.get.result,
          status: 200,
        });
      });

      it('[4YFQ] should fetch all webhooks for the user', () => {
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

      it('[RIZV] should return a status 200 with a webhooks object which is an array', () => {
        validation.check(response, {
          schema: methodsSchema.get.result,
          status: 200,
        });
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
      sharedAccessId = cuid();
      webhookId1 = cuid();
      webhookId2 = cuid();
      webhookId3 = cuid();
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
          id: sharedAccessId,
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
        user.webhook({
          id: webhookId3,
        }, sharedAccessId);
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

        it('[XMB7] should return a status 200 with a webhook object', () => {
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

        it('[BDC2] should return a status 403 with a forbidden error', () => {
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

        it('[O6MM] should return a status 404 with a unknown resource error', () => {
          validation.checkErrorUnknown(response);
        });
      });
    
    });

    describe('when using a personal token', () => {
      let response;
      before(async () => {
        const res = await server.request()
          .get(`/${username}/webhooks/${webhookId2}`)
          .set('Authorization', personalAccessToken);
        response = res;
      });

      it('[D8YQ] should return a status 200 with a webhook object', () => {
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
          .get(`/${username}/webhooks/${webhookId3}`)
          .set('Authorization', sharedAccessToken);
        response = res;
      });

      it('[604H] should return a status 200 with a webhook object', () => {
        validation.check(response, {
          schema: methodsSchema.getOne.result,
          status: 200,
        });
      });
    });

  });

  describe('POST /', () => {

    let usedUrl = 'https://existing.com/notifications';

    before(async () => {
      await mongoFixtures.clean();
      username = cuid();
      personalAccessToken = cuid();
      appAccessId1 = cuid();
      appAccessToken1 = cuid();
      sharedAccessId = cuid();
      sharedAccessToken = cuid();
    });

    before(() => {
      return mongoFixtures.user(username, {}, async (user) => {
        user.access({
          type: 'personal', token: personalAccessToken,
        });
        user.session(personalAccessToken);
        user.access({
          id: appAccessId1,
          type: 'app', token: appAccessToken1,
          permissions: [{streamId: charlatan.Lorem.word(), level: 'read'}],
        });
        user.access({
          id: sharedAccessId,
          type: 'shared', token: sharedAccessToken,
        });
        user.webhook({
          url: usedUrl,
        }, appAccessId1);
      });
    });

    describe('when using an app token', () => {

      describe('when providing a valid webhook', () => {
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

        it('[Z1XD] should return a status 201 with the created webhook', () => {
          validation.check(response, {
            status: 201,
            schema: methodsSchema.create.result,
            data: webhook,
            sanitizeFn: validation.removeTrackingPropertiesForOne,
            sanitizeTarget: 'webhook',
          });
        });
        it('[XKLU] should save it to the storage', async () => {
          const storedWebhook = await bluebird.fromCallback(
            cb => storage.findOne({ id: username }, { id: { $eq: webhook.id } }, {}, cb)
          );
          assert.deepEqual(validation.removeTrackingPropertiesForOne(storedWebhook),
            validation.removeTrackingPropertiesForOne(webhook));
        });
      });

      describe('when providing an existing url', () => {

        let response;
        before(async () => {
          const res = await server.request()
            .post(`/${username}/webhooks`)
            .set('Authorization', appAccessToken1)
            .send({ url: usedUrl });
          response = res;
        });

        it('[60OQ] should return a status 409 with a collision error error', () => {
          validation.checkError(response, {
            status: 409,
            id: ErrorIds.ItemAlreadyExists
          });
        });
      });

      describe('when providing invalid parameters', () => {

        describe('when url is not a string', () => {

          const url = 123;

          let response;
          before(async () => {
            const res = await server.request()
              .post(`/${username}/webhooks`)
              .set('Authorization', appAccessToken1)
              .send({ url: url });
            response = res;
          });

          it('[3VIU] should return a status 400 with a invalid parameters error', () => {
            validation.checkErrorInvalidParams(response);
          });
        });

      });
    });


    describe('when using a shared token', () => {

      describe('when providing a valid webhook', () => {
        const url = `https://${charlatan.Internet.domainName()}/something`;
        let webhook, response;
        before(async () => {
          response = await server.request()
            .post(`/${username}/webhooks`)
            .set('Authorization', sharedAccessToken)
            .send({ url: url });
          webhook = new Webhook({
            accessId: sharedAccessId,
            url: url,
            id: response.body.webhook.id,
          }).forApi();
        });

        it('[YTLW] should return a status 201 with the created webhook', () => {
          validation.check(response, {
            status: 201,
            schema: methodsSchema.create.result,
            data: webhook,
            sanitizeFn: validation.removeTrackingPropertiesForOne,
            sanitizeTarget: 'webhook',
          });
        });
        it('[UC6J] should save it to the storage', async () => {
          const storedWebhook = await bluebird.fromCallback(
            cb => storage.findOne({ id: username }, { id: { $eq: webhook.id } }, {}, cb)
          );
          assert.deepEqual(validation.removeTrackingPropertiesForOne(storedWebhook),
            validation.removeTrackingPropertiesForOne(webhook));
        });

      });
    });

    describe('when using a personal token', () => {     

      describe('when providing a valid webhook', () => {
        let response;
        before(async () => {
          const res = await server.request()
            .post(`/${username}/webhooks`)
            .set('Authorization', personalAccessToken)
            .send({ url: 'doesntmatter' });
          response = res;
        });

        it('[3AZO] should return a status 403 with a forbidden error', () => {
          validation.checkErrorForbidden(response);
        });
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
      appAccessId2 = cuid();
      appAccessToken2 = cuid();
      sharedAccessId = cuid();
      sharedAccessToken = cuid();
      webhookId1 = cuid();
      webhookId2 = cuid();
      webhookId3 = cuid();
    });

    before(() => {
      return mongoFixtures.user(username, {}, async (user) => {
        user.access({
          type: 'personal', token: personalAccessToken,
        });
        user.session(personalAccessToken);
        user.access({
          id: appAccessId1,
          type: 'app', token: appAccessToken1,
        });
        user.access({
          id: appAccessId2,
          type: 'app', token: appAccessToken2,
        });
        user.access({
          id: sharedAccessId,
          type: 'shared', token: sharedAccessToken,
        });
        user.webhook({
          id: webhookId1,
          url: url,
          minIntervalMs: minIntervalMs,
          maxRetries: maxRetries,
          currentRetries: 5,
          state: 'inactive',
        }, appAccessId1);
        user.webhook({
          id: webhookId2,
        }, appAccessId2);
        user.webhook({
          id: webhookId3,
        }, sharedAccessId);
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
                state: 'active',
              });
            response = res;
            webhook = new Webhook({
              accessId: appAccessId1,
              url: url,
              id: webhookId1,
              minIntervalMs: minIntervalMs,
              maxRetries: maxRetries,
              state: 'active',
              currentRetries: 0
            }).forApi();
          });

          it('[C9FU] should return a status 200 with the updated webhook', () => {
            validation.check(response, {
              status: 200,
              schema: methodsSchema.update.result,
              data: webhook,
              sanitizeFn: validation.removeTrackingPropertiesForOne,
              sanitizeTarget: 'webhook',
            });
          });
          it('[JSOH] should apply the changes to the storage', async () => {
            const storedWebhook = await bluebird.fromCallback((cb) =>
              storage.findOne({ id: username }, { id: { $eq: webhookId1 } }, {}, cb)
            );
            assert.deepEqual(validation.removeTrackingPropertiesForOne(storedWebhook),
              validation.removeTrackingPropertiesForOne(webhook));
          });
        });

        describe('when changing a readonly parameter', () => {

          let response;
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
            response = res;
          });

          it('[PW4I] should return a status 403 with an invalid parameter error', () => {
            validation.checkErrorForbidden(response);
          });
        });

      });

      describe('when updating a webhook outside its scope', () => {

        let response;
        before(async () => {
          const res = await server.request()
            .put(`/${username}/webhooks/${webhookId2}`)
            .set('Authorization', appAccessToken1)
            .send({
              state: 'inactive',
            });
          response = res;
        });

        it('[8T2G] should return a status 403 with a forbidden error', () => {
          validation.checkErrorForbidden(response);
        });
      });

      describe('when updating an unexistant webhook', () => {
        let response;
        before(async () => {
          const res = await server.request()
            .put(`/${username}/webhooks/doesnotexist`)
            .set('Authorization', appAccessToken1)
            .send({
              state: 'active',
            });
          response = res;
        });

        it('[AR5R] should return a status 404 with an unknown resource error', () => {
          validation.checkErrorUnknown(response);
        });

      });
    });

    describe('when using a personal token', () => {

      describe('when providing valid parameters', () => {

        let response;
        before(async () => {
          const res = await server.request()
            .put(`/${username}/webhooks/${webhookId1}`)
            .set('Authorization', personalAccessToken)
            .send({
              state: 'inactive',
            });
          response = res;
        });

        it('[LCKN] should return a status 200 with the updated webhook', () => {
          validation.check(response, {
            status: 200,
            schema: methodsSchema.update.result,
          });
        });
      });

    });

    describe('when using a shared token', () => {

      describe('when providing valid parameters', () => {

        let response;
        before(async () => {
          const res = await server.request()
            .put(`/${username}/webhooks/${webhookId3}`)
            .set('Authorization', sharedAccessToken)
            .send({
              state: 'inactive',
            });
          response = res;
        });

        it('[TMIZ] should return a status 200 with the updated webhook', () => {
          validation.check(response, {
            status: 200,
            schema: methodsSchema.update.result,
          });
        });
      });

    });

  });

  describe('DELETE /:webhookId', () => {

    before(() => {
      personalAccessToken = cuid();
      appAccessId1 = cuid();
      appAccessToken1 = cuid();
      appAccessId2 = cuid();
      appAccessToken2 = cuid();
      sharedAccessToken = cuid();
      sharedAccessId = cuid();
      webhookId1 = cuid();
      webhookId2 = cuid();
      webhookId3 = cuid();
      webhookId4 = cuid();
    });

    before(() => {
      return mongoFixtures.user(username, {}, async (user) => {
        user.access({
          type: 'personal', token: personalAccessToken,
        });
        user.session(personalAccessToken);
        user.access({
          id: appAccessId1,
          type: 'app', token: appAccessToken1,
        });
        user.access({
          id: appAccessId2,
          type: 'app', token: appAccessToken2,
        });
        user.access({
          id: sharedAccessId,
          type: 'shared', token: sharedAccessToken,
        });
        user.webhook({
          id: webhookId1,
        }, appAccessId1);
        user.webhook({
          id: webhookId2,
        }, appAccessId2);
        user.webhook({
          id: webhookId3,
        }, appAccessId1);
        user.webhook({
          id: webhookId4,
        }, sharedAccessId);
      });
    });

    after(async () => {
      await mongoFixtures.clean();
    });

    describe('when using an app token', () => {
      describe('when deleting an existing webhook', () => {

        let response, deletion;
        before(async () => {
          const res = await server.request()
            .delete(`/${username}/webhooks/${webhookId1}`)
            .set('Authorization', appAccessToken1);
          response = res;
          deletion = {
            id: response.body.id,
            timestamp: response.body.timestamp,
          };
        });

        it('[A0CG] should return a status 200 with the webhook deletion', () => {
          validation.check(response, {
            status: 200,
            schema: methodsSchema.del.result,
            data: deletion,
          });
        });

        it('[KA98] should delete it in the storage', async () => {
          const deletedWebhook = await bluebird.fromCallback((cb) =>
            storage.findOne({ id: username }, { id: { $eq: webhookId1 } }, {}, cb)
          );
          assert.notExists(deletedWebhook);
        });
      });

      describe('when deleting an unexistant webhook', () => {

        let response;
        before(async () => {
          const res = await server.request()
            .delete(`/${username}/webhooks/doesnotexist`)
            .set('Authorization', appAccessToken1);
          response = res;
        });

        it('[ZPRT] should return a status 404 with an unknown resource error', () => {
          validation.checkErrorUnknown(response);
        });
      });

      describe('when deleting an already deleted webhook', () => {

        let response;
        before(async () => {
          const res = await server.request()
            .delete(`/${username}/webhooks/${webhookId1}`)
            .set('Authorization', appAccessToken1);
          response = res;
        });

        it('[5UX7] should return a status 404 with an unknown resource error', () => {
          validation.checkErrorUnknown(response);
        });
      });

      describe('when deleting a webhook outside of its scope', () => {

        let response;
        before(async () => {
          const res = await server.request()
            .delete(`/${username}/webhooks/${webhookId2}`)
            .set('Authorization', appAccessToken1);
          response = res;
        });

        it('[7O0F] should return a status 403 with a forbidden error', () => {
          validation.checkErrorForbidden(response);
        });
      });
    });

    describe('when using a personal token', () => {
      describe('when deleting an existing webhook', () => {

        let response, deletion;
        before(async () => {
          const res = await server.request()
            .delete(`/${username}/webhooks/${webhookId3}`)
            .set('Authorization', personalAccessToken);
          response = res;
          deletion = {
            id: response.body.id,
            timestamp: response.body.timestamp,
          };
        });

        it('[P6X4] should return a status 200 with the webhook deletion', () => {
          validation.check(response, {
            status: 200,
            schema: methodsSchema.del.result,
            data: deletion,
          });
        });
      });
    });

    describe('when using a shared token', () => {
      describe('when deleting an existing webhook', () => {

        let response, deletion;
        before(async () => {
          const res = await server.request()
            .delete(`/${username}/webhooks/${webhookId4}`)
            .set('Authorization', sharedAccessToken);
          response = res;
          deletion = {
            id: response.body.id,
            timestamp: response.body.timestamp,
          };
        });

        it('[OZZB] should return a status 200 with the webhook deletion', () => {
          validation.check(response, {
            status: 200,
            schema: methodsSchema.del.result,
            data: deletion,
          });
        });

      });
    });
  });

  describe('POST /:webhookId/test', () => {

    const port = 5553;
    const postPath = '/notifications';

    let notificationsServer;
    before(async () => {
      notificationsServer = new HttpServer(postPath, 200);
      await notificationsServer.listen(port);
    });

    before(() => {
      personalAccessToken = cuid();
      appAccessId1 = cuid();
      appAccessToken1 = cuid();
      appAccessId2 = cuid();
      appAccessToken2 = cuid();
      sharedAccessId = cuid();
      sharedAccessToken = cuid();
      webhookId1 = cuid();
      webhookId2 = cuid();
      webhookId3 = cuid();
    });

    before(() => {
      return mongoFixtures.user(username, {}, async (user) => {
        user.access({
          type: 'personal', token: personalAccessToken,
        });
        user.session(personalAccessToken);
        user.access({
          id: appAccessId1,
          type: 'app', token: appAccessToken1,
        });
        user.access({
          id: appAccessId2,
          type: 'app', token: appAccessToken2,
        });
        user.access({
          id: sharedAccessId,
          type: 'shared', token: sharedAccessToken,
        });
        user.webhook({
          url: 'http://localhost:' + port + postPath,
          id: webhookId1,
        }, appAccessId1);
        user.webhook({
          id: webhookId2,
        }, appAccessId2);
        user.webhook({
          url: 'http://localhost:' + port + postPath,
          id: webhookId3,
        }, sharedAccessId);
      });
    });

    after(async () => {
      await mongoFixtures.clean();
      await notificationsServer.close();
    });

    describe('when using an app token', () => {

      describe('when the webhook exists', () => {

        describe('when the URL is valid', () => {
          
          let response;
          before(async () => {
            response = await server.request()
              .post(`/${username}/webhooks/${webhookId1}/test`)
              .set('Authorization', appAccessToken1);
          });

          it('[ZM2B] should return a status 200 with a webhook object', () => {
            validation.check(response, {
              schema: methodsSchema.test.result,
              status: 200,
            });
          });

          it('[Q7KL] should send a POST request to the URL', async () => {
            assert.isTrue(notificationsServer.isMessageReceived());
          }).timeout(1000);
        });

        describe('when the URL is invalid', () => {

          let response;
          before(async () => {
            notificationsServer.setResponseStatus(404);
            response = await server
              .request()
              .post(`/${username}/webhooks/${webhookId1}/test`)
              .set('Authorization', appAccessToken1);
          });

          it('[KLRO] should return a status 400 with an error object', () => {
            validation.check(response, {
              status: 400,
              id: ErrorIds.UnknownReferencedResource,
            });
          });
        });
        
      });

      describe('when the webhook does not exist', () => {
        let response;
        before(async () => {
          const res = await server.request()
            .post(`/${username}/webhooks/doesnotexist/test`)
            .set('Authorization', appAccessToken1);
          response = res;
        });

        it('[KXA8] should return a status 404 with a unknown resource error', () => {
          validation.checkErrorUnknown(response);
        });
      });

      describe('when the webhook is outside of its scope', () => {
        let response;
        before(async () => {
          const res = await server.request()
            .post(`/${username}/webhooks/${webhookId2}/test`)
            .set('Authorization', appAccessToken1);
          response = res;
        });

        it('[KZJD] should return a status 403 with a forbidden error', () => {
          validation.checkErrorForbidden(response);
        });
      });
    });

    describe('when using a personal token', () => {

      describe('when the webhook exists', () => {

        let response;
        before(async () => {
          notificationsServer.resetMessageReceived();
          notificationsServer.setResponseStatus(200);
          const res = await server.request()
            .post(`/${username}/webhooks/${webhookId1}/test`)
            .set('Authorization', personalAccessToken);
          response = res;
        });

        it('[HYZZ] should return a status 200 with a webhook object', () => {
          validation.check(response, {
            schema: methodsSchema.test.result,
            status: 200,
          });
        });

        it('[SBI7] should send a POST request to the URL', async () => {
          assert.isTrue(notificationsServer.isMessageReceived());
        }).timeout(1000);
      });
    });

    describe('when using a shared token', () => {

      describe('when the webhook exists', () => {
        let response;
        before(async () => {
          notificationsServer.resetMessageReceived();
          notificationsServer.setResponseStatus(200);
          const res = await server.request()
            .post(`/${username}/webhooks/${webhookId3}/test`)
            .set('Authorization', sharedAccessToken);
          response = res;
        });

        it('[O8PB] should return a status 200 with a webhook object', () => {
          validation.check(response, {
            schema: methodsSchema.test.result,
            status: 200,
          });
        });

        it('[C62I] should send a POST request to the URL', async () => {
          assert.isTrue(notificationsServer.isMessageReceived());
        }).timeout(1000);
      });
    });
  });
});