/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/*global describe, before, beforeEach, after, afterEach, it */

require('./test-helpers');

const _ = require('lodash');
const cuid = require('cuid');
const chai = require('chai');
const assert = chai.assert;

const { databaseFixture } = require('test-helpers');
const { produceMongoConnection, context } = require('./test-helpers');

require('date-utils');

describe('permissions selfRevoke', function () {
  let server;
  before(async () => {
    server = await context.spawn();
  });
  after(() => {
    server.stop();
  });

  let mongoFixtures;
  before(async function () {
    mongoFixtures = databaseFixture((await produceMongoConnection()));
  });

  describe('POST /accesses', function ( ) {
    let username,
        personalToken,
        basePathAccess;
    
    beforeEach(async function () {
      username = cuid();
      personalToken = cuid();
      basePathAccess = `/${username}/accesses/`;
      const user = await mongoFixtures.user(username, {});
      await user.access({
        type: 'personal',
        token: personalToken});
      await user.session(personalToken);
    });

    afterEach(() => {
      mongoFixtures.clean();
    });

    it('[JYL5] must list accesses with forbidden selfRevoke by GET /accesses', async () => {
      const res = await server.request().post(basePathAccess).set('Authorization', personalToken).send({
        type: 'app',
        name: 'toto',
        permissions: [{
          streamId: '*',
          level: 'contribute'
        }, {
          feature: 'selfRevoke',
          setting: 'forbidden'
        }]
      });
      
      assert.equal(res.status, 201);
      assert.exists(res.body.access);

      // --- check that permissions are visible with a .get()

      const res3 = await server.request().get(basePathAccess).set('Authorization', personalToken);
      assert.equal(res3.status, 200);
      assert.exists(res3.body.accesses);
      let found;
      for (let i = 0; i < res3.body.accesses.length && found == null; i++) {
        if (res3.body.accesses[i].id === res.body.access.id) found = res3.body.accesses[i];
      }
      assert.isNotNull(found);
      assert.exists(found.permissions);
      let featureFound = false;
      for (let i = 0; i < found.permissions.length; i++) {
        if (found.permissions[i].feature === 'selfRevoke') {
          assert.equal(found.permissions[i].setting, 'forbidden');
          featureFound = true;
        }
      }
      assert.isTrue(featureFound);
    });


    it('[JYU5] must forbid creating accesses with selfRevoke different than forbidden ', async () => {
      const res = await server.request().post(basePathAccess).set('Authorization', personalToken).send({
        type: 'app',
        name: 'toto',
        permissions: [{
          streamId: '*',
          level: 'contribute'
        }, {
          feature: 'selfRevoke',
          setting: 'bob'
        }]
      });
      assert.equal(res.status, 400);
      assert.exists(res.body.error);
      assert.equal(res.body.error.id, 'invalid-parameters-format');
    });

  });

  describe('DELETE /accesses', function () {
    let username,
        accesses,
        basePathAccess,
        accessKeys;

    const accessDefs = {};
    accessDefs['must allow app accesses to self revoke by default'] = { testCode: 'AHS6', selfRevoke: true };
    accessDefs['must forbid app accesses to self revoke when set'] = { testCode: 'H6DU', selfRevoke: false };
    accessDefs['must allow shared accesses to self revoke by default'] = { testCode: '3DR7', type: 'shared', selfRevoke: true };
    accessDefs['must forbid shared accesses to self revoke when set'] = { testCode: 'F62D', type: 'shared', selfRevoke: false };

    accessKeys = Object.keys(accessDefs);

    beforeEach(async function () {
      username = cuid();
      basePathAccess = `/${username}/accesses/`;
      accesses = _.clone(accessDefs);
      const user = await mongoFixtures.user(username, {});

      for (let i = 0; i < accessKeys.length; i++ ) {
        const access = accesses[accessKeys[i]];
        access.token = cuid();
        const data = {
          type: access.type || 'app',
          token: access.token,
          permissions: [{
            streamId: '*',
            level: 'contribute'
          }]
        };
        if (! access.selfRevoke) { 
          data.permissions.push({
            feature: 'selfRevoke',
            setting: 'forbidden'
          });
        }
        access.id = (await user.access(data)).attrs.id;
      }
    });
    afterEach(() => {
      mongoFixtures.clean();
    });

    for (let i = 0; i < accessKeys.length; i++) {
      const access = accessDefs[accessKeys[i]];
      it(`[${ access.testCode}] ` + accessKeys[i], async function () {
        const res = await server.request().delete(basePathAccess + access.id).set('Authorization', access.token);

        if (access.selfRevoke) {
          assert.equal(res.status, 200);
          assert.exists(res.body.accessDeletion);
          assert.equal(res.body.accessDeletion.id, access.id);
        } else {
          assert.equal(res.status, 403);
        }
      });
    }
    
  });
});