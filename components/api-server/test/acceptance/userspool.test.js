/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

/* global describe, it, before, after */
const { databaseFixture } = require('components/test-helpers');
const { produceMongoConnection, context } = require('../test-helpers');

const bluebird = require('bluebird');
const chai = require('chai');
const assert = chai.assert;
const helpers = require('../helpers');

const storage = require('components/test-helpers').dependencies.storage.user.events;
const database = require('components/test-helpers').dependencies.storage.database;

describe('users pool', () => {
  const adminKey = helpers.dependencies.settings.auth.adminAccessKey;
  let server;
  before(async () => {
    server = await context.spawn();
  });
  after(() => {
    server.stop(); 
  });


  describe('create pool user', () => {
    let res;
    let poolUser;
    let mongoFixtures;
    before(async () => {
      mongoFixtures = databaseFixture(await produceMongoConnection());

      res = await createPoolUser(); 
      poolUser = res.body;
    });

    after(async () => {
      await mongoFixtures.context.cleanEverything();
    });

    it('[80HI] succeeds', () => {
      assert.notExists(res.body.error);
      assert.isTrue(res.ok);
      assert.exists(poolUser);
    });
    it('[Y95U] contains a generated pool user id', () => {
      assert.isNotNull(poolUser.id);
    });
    it('[JKN6] created a user in the database', async () => {
      try {
        const user = await bluebird.fromCallback(cb =>
          database.findOne(
            storage.getCollectionInfoWithoutUserId(),
            storage.applyQueryToDB({
              $and: [
                { streamIds: { $in: ["username"] } },
                { content: { $regex: new RegExp('^' + 'pool@') } }
              ]
            }),
            null, cb));

        assert.isNotNull(user);
      } catch (err) {
        assert.isTrue(false);
      }
    });
  });

  describe('get pool size', () => {
    let res;
    let poolSize;

    describe('when empty', () => {

      before(async () => {
        res = await server.request()
          .get('/system/pool/size')
          .set('Authorization', adminKey);
        poolSize = res.body.size;
      });

      it('[DHID] must succeed', () => {
        assert.isTrue(res.ok);
      });
      
      it('[LH6N] must return 0', () => {
        assert.exists(poolSize);
        assert.equal(poolSize, 0);
      });
    });

    describe('when adding pool users', () => {

      before(async () => {
        mongoFixtures = databaseFixture(await produceMongoConnection());
        await createPoolUser();
        await createPoolUser();
        await createPoolUser();

        res = await server.request()
          .get('/system/pool/size')
          .set('Authorization', adminKey);

        poolSize = res.body.size;
      });

      after(async () => {
        await mongoFixtures.context.cleanEverything();
      });

      it('[CTP7] succeeds', () => {
        assert.isTrue(res.ok, 'response not ok');
        assert.notExists(res.body.error, 'response contains an error');
      });

      it('[APQS] has the right number of pool users', () => {
        assert.exists(poolSize, 'there is not pool size');
        assert.isTrue(poolSize === 3, 'the poolSize number is not as expected');
      });

    });
    
  });

  function createPoolUser() {
    return server.request()
      .post('/system/pool/create-user')
      .set('Authorization', adminKey)
      .send({});
  }
});
