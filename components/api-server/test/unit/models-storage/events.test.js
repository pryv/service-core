/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow
const chai = require('chai');
const assert = chai.assert;
const charlatan = require('charlatan');
const helpers = require('components/api-server/test/helpers');
const eventsStorage = helpers.dependencies.storage.user.events;
const { databaseFixture } = require('components/test-helpers');
const { produceMongoConnection, context } = require('components/api-server/test/test-helpers');
const UserRepository = require('components/business/src/users/repository');
const User = require('components/business/src/users/User');

describe('Events storage', () => {
  let server;
  before(async () => {
    server = await context.spawn();
  });
  after(() => {
    server.stop();
  });

  let mongoFixtures;
  before(async function () {
    mongoFixtures = databaseFixture(await produceMongoConnection());
    mongoFixtures.clean();
  });
  after(() => {
    mongoFixtures.clean();
  });
  let userId;
  let username;
  let email;
  let customRegistrationUniqueField;

  describe('createUser()', () => {
    before(async () => {
      userId = charlatan.Lorem.characters(10);
      username = charlatan.Lorem.characters(10);
      customRegistrationUniqueField = charlatan.App.name();
      email = charlatan.Internet.email();
      try {
        await mongoFixtures.user(userId, {
          username: username,
          email: email,
          customRegistrationUniqueField: customRegistrationUniqueField
        });
      } catch (err) {
        console.log('Preseeding of the test failed', err);
      }
    });

    after(async () => {
      await mongoFixtures.clean();
    });

    it('[7C22] must throw a duplicate error when username field is not unique', async () => {
      try {
        const usersRepository = new UserRepository(eventsStorage);
        const id = charlatan.Lorem.characters(10);
        const userObj: User = new User({
          id: id,
          username: username,
          password: charlatan.Lorem.characters(10),
          email: charlatan.Internet.email(),
        });
        await usersRepository.insertOne(userObj);

        assert.isTrue(false);
      } catch (err) {
        assert.isNotNull(err);
        // FLOW: we ensure that err contains the isDuplicate boolean with assert
        const isDuplicate = err.isDuplicate;
        assert.isBoolean(isDuplicate);
        assert.isTrue(isDuplicate);
        // FLOW: we ensure that err contains the isDuplicateIndex function with assert
        const isDuplicateIndex = err.isDuplicateIndex;
        assert.isFunction(isDuplicateIndex);
        assert.isTrue(isDuplicateIndex('username__unique'));
      }
    });

    it('[6CFE] must throw a duplicate error when email field is not unique', async () => {
      try {
        const usersRepository = new UserRepository(eventsStorage);
        const userObj: User = new User({
          id: charlatan.Lorem.characters(10),
          email: email
        });
        await usersRepository.insertOne(userObj);
        console.log('Test failed because error was not thrown');
        assert.isTrue(false);
      } catch (err) {
        assert.isNotNull(err);
        // FLOW: we ensure that err contains the isDuplicate boolean with assert
        const isDuplicate = err.isDuplicate;
        assert.isBoolean(isDuplicate);
        assert.isTrue(isDuplicate);
        // FLOW: we ensure that err contains the isDuplicateIndex function with assert
        const isDuplicateIndex = err.isDuplicateIndex;
        assert.isFunction(isDuplicateIndex);
        assert.isTrue(isDuplicateIndex('email__unique'));
      }
    });
  });
});
