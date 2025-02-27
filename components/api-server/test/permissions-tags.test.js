/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

const cuid = require('cuid');
const chai = require('chai');
const assert = chai.assert;
const charlatan = require('charlatan');

const { databaseFixture } = require('test-helpers');
const { produceMongoConnection, context } = require('./test-helpers');

describe('Access permissions - Tags', function () {
  let mongoFixtures;
  before(async function () {
    mongoFixtures = databaseFixture(await produceMongoConnection());
  });
  after(async () => {
    await mongoFixtures.clean();
  });

  let server;
  before(async () => {
    server = await context.spawn();
  });
  after(() => {
    server.stop();
  });

  let username,
    basePath,
    token;

  before(async () => {
    username = cuid();
    const user = await mongoFixtures.user(username, {});
    basePath = `/${username}/accesses`;
    token = cuid();
    await user.access({
      type: 'personal',
      token
    });
    await user.session(token);
  });

  it('[F93X] must return a 400 error when attempting to create an access with tag-based permissions', async () => {
    const res = await server.request().post(basePath).set('Authorization', token).send({
      name: charlatan.Lorem.word(10),
      permissions: [{
        tag: charlatan.Lorem.word(10),
        level: 'read'
      }]
    });
    assert.equal(res.status, 400);
  });
});
