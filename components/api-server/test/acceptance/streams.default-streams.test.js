/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const cuid = require('cuid');
const _ = require('lodash');
const path = require('path');
const assert = require('chai').assert;
const { describe, before, it } = require('mocha');
const supertest = require('supertest');
const charlatan = require('charlatan');
const ErrorIds = require('components/errors').ErrorIds;
const Settings = require('components/api-server/src/settings');
const Application = require('components/api-server/src/application');
const Notifications = require('components/api-server/src/Notifications');
const { databaseFixture } = require('components/test-helpers');
const { produceMongoConnection } = require('components/api-server/test/test-helpers');

describe("Virtual streams", function () {
  let app;
  let request;
  let res;
  let mongoFixtures;
  let basePath;
  let access;
  let user;

  async function createUser () {
    user = await mongoFixtures.user(charlatan.Lorem.characters(7), {
      insurancenumber: charlatan.Number.number(4),
      phoneNumber: charlatan.Lorem.characters(3)
    });
    basePath = '/' + user.attrs.username + '/streams';
    access = await user.access({
      type: 'app',
      permissions: [
        {
          streamId: '*',
          level: 'manage',
        }
      ],
      token: cuid(),
    });
    access = access.attrs;
    return user;
  }

  before(async function () {
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
    require("components/api-server/src/methods/streams")(
      app.api,
      app.storageLayer.streams,
      app.storageLayer.events,
      app.storageLayer.eventFiles,
      notifications,
      app.logging,
      app.settings.get('audit').obj(),
      app.settings.get('updates').obj());
  
    request = supertest(app.expressApp);
  });

  describe('GET /streams', async () => {
    it('Should return all streams - including default ones', async () => {
      await createUser();
      res = await request.get(basePath).set('authorization', access.token);
      assert.deepEqual(res.body.streams, [
        {
          name: 'account',
          id: 'account',
          parentId: null,
          children: [
            {
              name: 'Username',
              id: 'username',
              parentId: 'account',
              children: []
            },
            { name: 'Email', id: 'email', parentId: 'account', children: [] },
            {
              name: 'Language',
              id: 'language',
              parentId: 'account',
              children: []
            },
            {
              name: 'Storage used',
              id: 'storageUsed',
              parentId: 'account',
              children: [
                {
                  name: 'Db Documents',
                  id: 'dbDocuments',
                  parentId: 'storageUsed',
                  children: []
                },
                {
                  name: 'Attached files',
                  id: 'attachedFiles',
                  parentId: 'storageUsed',
                  children: []
                }
              ]
            },
            {
              name: 'Storage used',
              id: 'storageUsed',
              parentId: 'account',
              children: []
            },
            {
              name: 'insurancenumber',
              id: 'insurancenumber',
              parentId: 'account',
              children: []
            },
            {
              name: 'phoneNumber',
              id: 'phoneNumber',
              parentId: 'account',
              children: []
            }
          ]
        }
      ]);
    });
  });

  describe('POST /streams', async () => {
    describe('When creating a child to default streams', async () => {
      before(async function () {
        await createUser();
        res = await request.post(basePath)
          .send({
            name: charlatan.Lorem.characters(7),
            parentId: 'language',
          })
          .set('authorization', access.token);
      });
      it('Should return status 400', async () => {
        assert.equal(res.status, 400);
      });
      it('Should return the correct error', async () => {
        assert.equal(res.body.error.id, ErrorIds.UnknownReferencedResource);
      });
    });
  });

  describe('PUT /streams/<id>', async () => {
    let streamData;
    describe('When updating a default stream', async () => {
      before(async function () {
        await createUser();
        streamData = {
          name: 'lanugage2'
        };
        res = await request.put(path.join(basePath, 'language'))
          .send(streamData)
          .set('authorization', access.token);
      });
      it('Should return status 404', async () => {
        assert.equal(res.status, 404);
      });
      it('Should return the correct error', async () => {
        assert.equal(res.body.error.id, ErrorIds.UnknownResource);
      });
    });
  });

  describe('DELETE /streams/<id>', async () => {
    describe('When deleting a default stream', async () => {
      before(async function () {
        await createUser();
        res = await request.delete(path.join(basePath, 'language'))
          .set('authorization', access.token);
      });
      it('Should return status 404', async () => { 
        assert.equal(res.status, 404);
      });
      it('Should return the correct error', async () => {
        assert.equal(res.body.error.id, ErrorIds.UnknownResource);
      });
    });
  });
});