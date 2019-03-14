// @flow

/* global describe, it, beforeEach */

const chai = require('chai');
const assert = chai.assert;
const bluebird = require('bluebird');

const Database = require('../../src/Database');

describe('Database', () => {
  const connectionSettings = {
    host: 'localhost',
    port: 27017,
    name: 'pryv-node',
  };

  let database;
  beforeEach((done) => {
    database = new Database(connectionSettings, console);

    database.ensureConnect(done);
  });

  describe('#close()', () => {
    it('closes the database connection', async () => {
      await database.close();
    });
  });

  describe('isDuplicateError utility', () => {

    const collectionInfo = {
      name: 'duplicateTest',
      indexes: [{
        index: {duplicateKey: 1},
        options: {unique: true}
      }]
    };

    beforeEach((done) => {
      database.dropCollection(collectionInfo, (err) => {
        done(err);
      });
    });

    // cf. GH issue #163
    it('must detect mongo duplicate errors correctly', async () => {

      const duplicateMsg = `E11000 duplicate key error collection: ${connectionSettings.name}.${collectionInfo.name} index:`;

      // First insert, should succeed
      database.insertOne(collectionInfo, {duplicateKey: 'duplicate'}, (err, res) => {
        assert.exists(res);
        assert.notExists(err);
        // Second insert, should lead to duplicate error
        database.insertOne(collectionInfo, {duplicateKey: 'duplicate'}, (err, res) => {
          assert.exists(err);
          assert.isTrue(Database.isDuplicateError(err));
          assert.include(err.errmsg, duplicateMsg, 'Mongo duplicate error message changed!');
          assert.notExists(res);
        });
      }); 
    });
  });
});
