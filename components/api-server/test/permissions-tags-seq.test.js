/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

/* global initTests, initCore, coreRequest, getNewFixture, assert, cuid, charlatan */

describe('[PTAG] Access permissions - Tags', function () {
  let mongoFixtures;

  before(async function () {
    await initTests();
    await initCore();
    mongoFixtures = getNewFixture();
  });

  after(async () => {
    await mongoFixtures.clean();
  });

  let username, basePath, token;

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
    const res = await coreRequest
      .post(basePath)
      .set('Authorization', token)
      .send({
        name: charlatan.Lorem.word(10),
        permissions: [{
          tag: charlatan.Lorem.word(10),
          level: 'read'
        }]
      });
    assert.equal(res.status, 400);
  });
});
