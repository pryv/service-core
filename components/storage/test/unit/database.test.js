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

  describe('Mongo duplicate errors', () => {

    const collectionInfo = {
      name: 'duplicateTest',
      indexes: [{
        index: {duplicateKey: 1},
        options: {unique: true}
      }]
    };
    const duplicateEntry = {duplicateKey: 'duplicate'};

    beforeEach((done) => {
      database.dropCollection(collectionInfo, () => {
        database.insertOne(collectionInfo, duplicateEntry, (err, res) => {
          assert.isNull(err);
          assert.isNotNull(res);
          done(err);
        });
      });
    });

    it('must detect mongo duplicate errors with isDuplicateError', (done) => {
      database.insertOne(collectionInfo, duplicateEntry, (err) => {
        assert.isNotNull(err);
        assert.isTrue(Database.isDuplicateError(err));
        done();
      });
    });

    it('must augment mongo duplicate errors with the duplicate index', (done) => {
      database.insertOne(collectionInfo, duplicateEntry, (err) => {
        // FLOW: we ensure err contains the string duplicateIndex with assert
        const duplicateIndex = err.duplicateIndex;
        assert.equal(duplicateIndex, '_id_');
        done();
      }); 
    });

    // This helps detecting if Mongo decides to change the error message format,
    // which may break our regular expression matchings, cf. GH issue #163.
    it('must fail if mongo duplicate error message changed', (done) => {
      const duplicateMsg = `E11000 duplicate key error collection: ${connectionSettings.name}.${collectionInfo.name} index:`;
      database.insertOne(collectionInfo, duplicateEntry, (err) => {
        // FLOW: we ensure that err contains the string errmsg with assert
        const errMsg = err.errmsg;
        assert.isString(errMsg);
        assert.include(errMsg, duplicateMsg, 'Mongo duplicate error message changed!');
        done();
      });
    });
  });
});
