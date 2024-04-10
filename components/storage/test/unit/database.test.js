/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const chai = require('chai');
const assert = chai.assert;
const Database = require('../../src/Database');
const { getConfig } = require('@pryv/boiler');

describe('Database', () => {
  let connectionSettings;
  let database;
  beforeEach(async () => {
    const config = await getConfig();
    connectionSettings = structuredClone(config.get('database'));
    connectionSettings.name = 'pryv-node-test';
    database = new Database(connectionSettings);
    await database.ensureConnect();
  });
  describe('#close()', () => {
    it('[BYRG] closes the database connection', async () => {
      await database.close();
    });
  });
  describe('Mongo duplicate errors', () => {
    const collectionInfo = {
      name: 'duplicateTest',
      indexes: [
        {
          index: { name: 1, username: 1 },
          options: { unique: true }
        }
      ]
    };
    beforeEach((done) => {
      database.insertOne(collectionInfo, { name: 'toto', username: 'mrtoto', age: 17 }, (err) => {
        done(err);
      });
    });
    afterEach((done) => {
      database.dropCollection(collectionInfo, (err) => {
        done(err);
      });
    });
    it('[9UBA] must detect mongo duplicate errors with isDuplicateError', (done) => {
      database.insertOne(collectionInfo, { name: 'toto', username: 'mrtoto', age: 22 }, (err) => {
        assert.isNotNull(err);
        assert.isTrue(Database.isDuplicateError(err));
        done();
      });
    });
    it('[W1FO] must augment mongo duplicate errors with duplicate check utilities', (done) => {
      database.insertOne(collectionInfo, { name: 'toto', username: 'mrtoto', age: 22 }, (err) => {
        assert.isNotNull(err);
        // we ensure that err contains the isDuplicate boolean with assert
        const isDuplicate = err.isDuplicate;
        assert.isBoolean(isDuplicate);
        assert.isTrue(isDuplicate);
        // we ensure that err contains the isDuplicateIndex function with assert
        const isDuplicateIndex = err.isDuplicateIndex;
        assert.isFunction(isDuplicateIndex);
        if (database.isFerret) return done();
        assert.isTrue(err.isDuplicateIndex('name'));
        assert.isTrue(err.isDuplicateIndex('username'));
        assert.isFalse(err.isDuplicateIndex('age'));
        done();
      });
    });
    // This helps detecting if Mongo decides to change the error message format,
    // which may break our regular expression matchings, cf. GH issue #163.
    it('[D0EN] must fail if mongo duplicate error message changed', (done) => {
      let duplicateMsg = `E11000 duplicate key error collection: ${connectionSettings.name}.${collectionInfo.name} index: name_1_username_1 dup key:`;
      if (database.isFerret) duplicateMsg = `E11000 duplicate key error collection: ${connectionSettings.name}.${collectionInfo.name}`;
      database.insertOne(collectionInfo, { name: 'toto', username: 'mrtoto', age: 22 }, (err) => {
        try {
          // we ensure that err contains the string errmsg with assert
          const errMsg = err.errmsg;
          assert.isString(errMsg);
          assert.include(errMsg, duplicateMsg, 'Mongo duplicate error message changed!');
          done();
        } catch (err) {
          done(err);
        }
      });
    });
  });
});
