// @flow

/* global describe, it, beforeEach */

const chai = require('chai');
const assert = chai.assert;

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

    it('must detect mongo duplicate errors correctly', (done) => {
      const duplicateMsg = `E11000 duplicate key error collection: ${connectionSettings.name}.${collectionInfo.name} index:`;
      const duplicateEntry = {duplicateKey: 'duplicate'};

      // First insert, should succeed
      database.insertOne(collectionInfo, duplicateEntry, (err, res) => {
        assert.isNotNull(res);
        assert.isNull(err);
        // Second insert, should lead to duplicate error
        database.insertOne(collectionInfo, duplicateEntry, (err, res) => {
          assert.isNotNull(err);
          assert.isNull(res);
          assert.isTrue(Database.isDuplicateError(err));
          // FLOW
          const dupIndex = err.dupIndex;
          assert.equal(dupIndex, '_id_');
          // This helps detecting if Mongo decides to change the error message format,
          // which may break our regular expression matchings, cf. GH issue #163.
          // FLOW
          const errMsg = err.errmsg;
          assert.isString(errMsg);
          assert.include(errMsg, duplicateMsg, 'Mongo duplicate error message changed!');
          done();
        });
      }); 
    });
  });
});
