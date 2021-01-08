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
const Application = require('components/api-server/src/application');
const Notifications = require('components/api-server/src/Notifications');
const { databaseFixture } = require('components/test-helpers');
const { produceMongoConnection } = require('components/api-server/test/test-helpers');

describe("System streams", function () {
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
      type: 'personal',
      token: cuid(),
    });
    access = access.attrs;
    await user.session(access.token);
    return user;
  }

  before(async function () {
    mongoFixtures = databaseFixture(await produceMongoConnection());
  
    app = new Application();
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

  describe('GET /streams', () => {
    describe('When using a personal access', () => {
      it('[9CGO] Should return all streams - including system ones', async () => {
        await createUser();
        res = await request.get(basePath).set('authorization', access.token);
        assert.deepEqual(res.body.streams, [
          {
            name: 'account',
            id: '.account',
            parentId: null,
            children: [
              {
                name: 'Username',
                id: '.username',
                parentId: '.account',
                children: []
              },
              {
                name: 'Language',
                id: '.language',
                parentId: '.account',
                children: []
              },
              {
                name: 'Storage used',
                id: '.storageUsed',
                parentId: '.account',
                children: [
                  {
                    name: 'Db Documents',
                    id: '.dbDocuments',
                    parentId: '.storageUsed',
                    children: []
                  },
                  {
                    name: 'Attached files',
                    id: '.attachedFiles',
                    parentId: '.storageUsed',
                    children: []
                  }
                ]
              },
              {
                name: 'insurancenumber',
                id: '.insurancenumber',
                parentId: '.account',
                children: []
              },
              {
                name: 'phoneNumber',
                id: '.phoneNumber',
                parentId: '.account',
                children: []
              },
              { name: 'Email', id: '.email', parentId: '.account', children: [] },
            ]
          },
          {
            id: ".helpers",
            name: "helpers",
            parentId: null,
            children: [
              {
                id: ".active",
                name: "Active",
                parentId: ".helpers",
                children: []
              }
            ] 
          }
        ]);
      });
    });
  });

  describe('POST /streams', () => {
    describe('When using a personal access', () => {
      describe('to create a child to a system stream', () => {
        before(async function () {
          await createUser();
          res = await request.post(basePath)
            .send({
              name: charlatan.Lorem.characters(7),
              parentId: '.language',
            })
            .set('authorization', access.token);
        });
        it('[GRI4] should return status 400', async () => {
          assert.equal(res.status, 400);
        });
        it('[XP07] should return the correct error', async () => {
          assert.equal(res.body.error.id, ErrorIds.InvalidOperation);
        });
      });
    });
  });

  describe('PUT /streams/<id>', () => {
    describe('When using a personal access', () => {
      let streamData;
      describe('to update a system stream', () => {
        before(async function () {
          await createUser();
          streamData = {
            name: 'lanugage2'
          };
          res = await request.put(path.join(basePath, 'language'))
            .send(streamData)
            .set('authorization', access.token);
        });
        it('[SLIR] should return status 400', async () => {
          assert.equal(res.status, 400);
        });
        it('[V6HC] should return the correct error', async () => {
          assert.equal(res.body.error.id, ErrorIds.InvalidOperation);
        });
      });
    });
  });

  describe('DELETE /streams/<id>', () => {
    describe('When using a personal access', () => {
      describe('to delete a system stream', () => {
        before(async function () {
          await createUser();
          res = await request.delete(path.join(basePath, 'language'))
            .set('authorization', access.token);
        });
        it('[1R35] should return status 400', async () => { 
          assert.equal(res.status, 400);
        });
        it('[4939] should return the correct error', async () => {
          assert.equal(res.body.error.id, ErrorIds.InvalidOperation);
        });
      });
    });
  });
});