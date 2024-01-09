/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const chai = require('chai');
const assert = chai.assert;
const charlatan = require('charlatan');
require('test-helpers/src/api-server-tests-config');
const { databaseFixture } = require('test-helpers');
const { produceMongoConnection } = require('api-server/test/test-helpers');
const { getUsersRepository, User } = require('business/src/users');
const { ErrorIds } = require('errors');

describe('Users repository', () => {
  let mongoFixtures;
  before(async function () {
    mongoFixtures = databaseFixture(await produceMongoConnection());
    await mongoFixtures.clean();
  });
  after(async () => {
    await mongoFixtures.clean();
  });
  let username;
  let email;
  let customRegistrationUniqueField;
  describe('createUser()', () => {
    before(async () => {
      username = charlatan.Lorem.characters(10);
      customRegistrationUniqueField = charlatan.App.name();
      email = charlatan.Internet.email();
      try {
        await mongoFixtures.user(username, {
          email,
          customRegistrationUniqueField
        });
      } catch (err) {
        console.log('Preseeding of the test failed', err);
      }
    });
    after(async () => {
      await mongoFixtures.clean();
    });
    it('[7C22] must throw an item already exists error when username field is not unique', async () => {
      try {
        const usersRepository = await getUsersRepository();
        const userObj = new User({
          id: charlatan.Lorem.characters(10),
          username,
          password: charlatan.Lorem.characters(10),
          email: charlatan.Internet.email()
        });
        await usersRepository.insertOne(userObj);
        assert.isTrue(false);
      } catch (err) {
        assert.equal(err.id, ErrorIds.ItemAlreadyExists);
        assert.deepEqual(err.data, { username });
      }
    });
    it('[6CFE] must throw an item already exists error when email field is not unique', async () => {
      try {
        const usersRepository = await getUsersRepository();
        const userObj = new User({
          id: charlatan.Lorem.characters(10),
          username: charlatan.Lorem.characters(10),
          email
        });
        await usersRepository.insertOne(userObj);
        assert.isTrue(false);
      } catch (err) {
        assert.equal(err.id, ErrorIds.ItemAlreadyExists);
        assert.deepEqual(err.data, { email });
      }
    });
  });
});
