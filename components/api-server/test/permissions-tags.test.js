/* global describe, it, before, after */

const cuid = require('cuid');
const chai = require('chai');

const { assert } = chai;
const charlatan = require('charlatan');

const { databaseFixture } = require('components/test-helpers');
const { produceMongoConnection, context } = require('./test-helpers');

describe('Access permissions - Tags', () => {
  let mongoFixtures;
  before(async () => {
    mongoFixtures = databaseFixture(await produceMongoConnection());
  });
  after(() => {
    mongoFixtures.clean();
  });

  let server;
  before(async () => {
    server = await context.spawn();
  });
  after(() => {
    server.stop();
  });

  let user;
  let username;
  let streamParentId;
  let streamChildId;
  let basePath;

  before(async () => {
    username = cuid();
    streamParentId = cuid();
    streamChildId = cuid();
    user = await mongoFixtures.user(username, {});
    await user.stream({
      id: streamParentId,
      name: 'Does not matter at all',
    });
    await user.stream({
      parentId: streamParentId,
      id: streamChildId,
      name: 'Does not matter at all again',
    });
    basePath = `/${username}/accesses`;
  });

  describe('stream-only', () => {
    let access;
    before(async () => {
      access = await user.access({
        type: 'app',
        permissions: [
          {
            streamId: streamParentId,
            level: 'manage',
          },
        ],
        token: cuid(),
      });
      access = access.attrs;
    });

    it('[QA3G] should not be allowed to create tag-only accesses', async () => {
      const res = await server
        .request()
        .post(basePath)
        .set('Authorization', access.token)
        .send({
          type: 'shared',
          name: charlatan.Lorem.word(),
          permissions: [
            {
              tag: charlatan.Lorem.word(),
              level: 'manage',
            },
          ],

        });
      assert.equal(res.status, 403);
    });

    it('[HT0Z] should not be able to add tags even if a subset of streams are kept', async () => {
      // TODO although illogic, keeping this since we drop tags soon
      const res = await server
        .request()
        .post(basePath)
        .set('Authorization', access.token)
        .send({
          type: 'shared',
          name: charlatan.Lorem.word(),
          permissions: [
            {
              tag: charlatan.Lorem.word(),
              level: 'manage',
            },
            {
              streamId: streamParentId,
              level: 'manage',
            },
          ],
        });
      assert.equal(res.status, 403);
    });
  });

  describe('tag-only', () => {
    let access;
    before(async () => {
      access = await user.access({
        type: 'app',
        permissions: [
          {
            tag: charlatan.Lorem.word(),
            level: 'manage',
          },
        ],
        token: cuid(),
      });
      access = access.attrs;
    });

    it('[HL9C] should not be able to create accesses with additional tags', async () => {
      const res = await server
        .request()
        .post(basePath)
        .set('Authorization', access.token)
        .send({
          type: 'shared',
          name: charlatan.Lorem.word(),
          permissions: [
            {
              tag: access.permissions[0].tag,
              level: 'manage',
            },
            {
              tag: charlatan.Lorem.word(),
              level: 'manage',
            },
          ],
        });
      assert.equal(res.status, 403);
    });

    it('[88S2] should not be able to create stream-based accesses', async () => {
      const res = await server
        .request()
        .post(basePath)
        .set('Authorization', access.token)
        .send({
          type: 'shared',
          name: charlatan.Lorem.word(),
          permissions: [
            {
              tag: access.permissions[0].tag,
              level: 'manage',
            },
            {
              streamId: streamParentId,
              level: 'manage',
            },
          ],
        });
      assert.equal(res.status, 403);
    });
  });

  describe('mixed', () => {
    let access;
    before(async () => {
      access = await user.access({
        type: 'app',
        permissions: [
          {
            tag: charlatan.Lorem.word(),
            level: 'manage',
          },
          {
            tag: charlatan.Lorem.word(),
            level: 'manage',
          },
          {
            streamId: streamParentId,
            level: 'manage',
          },
        ],
        token: cuid(),
      });
      access = access.attrs;
    });

    it('[TTUD] should not be able to create tag-only accesses', async () => {
      const res = await server
        .request()
        .post(basePath)
        .set('Authorization', access.token)
        .send({
          type: 'shared',
          name: charlatan.Lorem.word(),
          permissions: [
            {
              tag: access.permissions[0].tag,
              level: 'manage',
            },
            {
              tag: access.permissions[1].tag,
              level: 'manage',
            },
          ],
        });
      assert.equal(res.status, 403);
    });

    it('[4UZ1] should not be able to create accesses with a subset of streams and additional tags', async () => {
      const res = await server
        .request()
        .post(basePath)
        .set('Authorization', access.token)
        .send({
          type: 'shared',
          name: charlatan.Lorem.word(),
          permissions: [
            {
              tag: access.permissions[0].tag,
              level: 'manage',
            },
            {
              tag: access.permissions[1].tag,
              level: 'manage',
            },
            {
              streamId: streamParentId,
              level: 'manage',
            },
            {
              tag: charlatan.Lorem.word(),
              level: 'manage',
            },
          ],
        });
      assert.equal(res.status, 403);
    });

    it('[E6Y5] should be able to create an access with a subset of streams and less tags', async () => {
      const res = await server
        .request()
        .post(basePath)
        .set('Authorization', access.token)
        .send({
          type: 'shared',
          name: charlatan.Lorem.word(),
          permissions: [
            {
              tag: access.permissions[0].tag,
              level: 'manage',
            },
            {
              streamId: streamParentId,
              level: 'manage',
            },
          ],
        });
      assert.equal(res.status, 201);
    });
  });
});
