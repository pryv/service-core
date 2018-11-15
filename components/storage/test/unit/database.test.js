// @flow

/* global describe, it, beforeEach */

const chai = require('chai');

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
});

