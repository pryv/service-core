/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// @flow
const cuid = require('cuid');
const _ = require('lodash');
const path = require('path');
const bluebird = require('bluebird');
const nock = require('nock');
const assert = require('chai').assert;
const { describe, before, it } = require('mocha');
const supertest = require('supertest');
const charlatan = require('charlatan');

const { getConfig } = require('components/api-server/config/Config');
const Settings = require('components/api-server/src/settings');
const Application = require('components/api-server/src/application');
const Notifications = require('components/api-server/src/Notifications');
const NatsConsumer = require('components/api-server/test/support/NatsConsumer');

const { databaseFixture } = require('components/test-helpers');
const { produceMongoConnection } = require('components/api-server/test/test-helpers');

describe('audit logs', () => {

  describe('GET /events', () => {
    let config;
    let validation;
    let app;
    let request;
    let res;
    let mongoFixtures;
    let basePath;
    let access;
    let user;
    let natsConsumer;
  
    before(async function () {
      config = getConfig();
      config.set('singleNode:isActive', false);
      const helpers = require('components/api-server/test/helpers');
      validation = helpers.validation;
      mongoFixtures = databaseFixture(await produceMongoConnection());
      const settings = await Settings.load();
  
      app = new Application(settings);
      await app.initiate();
  
      // Initialize notifications dependency
      let axonMsgs = [];
      const axonSocket = {
        emit: (...args) => axonMsgs.push(args),
      };
      const notifications = new Notifications(axonSocket);
      
      notifications.serverReady();
      require("components/api-server/src/methods/events")(
        app.api,
        app.storageLayer.events,
        app.storageLayer.eventFiles,
        app.settings.get('auth').obj(),
        app.settings.get('service.eventTypes').str(),
        notifications,
        app.logging,
        app.settings.get('audit').obj(),
        app.settings.get('updates').obj(),
        app.settings.get('openSource').obj(),
        app.settings.get('services').obj());
  
      request = supertest(app.expressApp);
    });
  
    before(async () => {
      user = await mongoFixtures.user(cuid());
      access = await user.access({
        type: 'personal',
        token: cuid(),
      });
      access = access.attrs;
      await user.session(access.token);
      const stream = await user.stream({ id: 'anything' });
      await stream.event({
        type: 'note/txt',
        content: 'salut',
      });
    });

    before(() => {
      natsConsumer = new NatsConsumer({
        channel: config.get('auditLogs:natsChannel'),
        uri: require('components/utils').messaging.NATS_CONNECTION_URI;
      });
    });
  
    describe('when given not existing username', function() {
      const queryParams = 'limit=2'
      before(async function() {
        res = await request.get(`/${user.attrs.username}/events?${queryParams}`)
          .set('Authorization', access.token);
      });
      it(`should respond with 200`, function() {
        assert.equal(res.status, 200);
      });
      it('should write on the NATS message queue', () => {
        const messages = natsConsumer.messages;
        assert.exists(messages);
        assert.equal(messages.length, 1);
      });
    });
  });
  
  
});
