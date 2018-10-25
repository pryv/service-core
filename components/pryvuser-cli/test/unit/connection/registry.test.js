// @flow

/* global describe, it, beforeEach, afterEach */

const bluebird = require('bluebird');

import type { RegistrySettings } from '../../../src/configuration';
const Registry = require('../../../src/connection/registry');

const chai = require('chai');
const assert = chai.assert;

describe('Connection/Registry', () => {
  describe('when using a mocked registry API', () => {
    let registryMock; 
    beforeEach(() => {
      registryMock = new MockRegistry(); 
      return registryMock.start('localhost', 12345); 
    });
    afterEach(() => {
      return registryMock.stop(); 
    });

    const settings: RegistrySettings = {
      url: 'http://localhost:12345',
      key: '0123456789',
    };

    let registry; 
    beforeEach(() => {
      registry = new Registry(settings);
    });

    describe('#preflight(username)', () => {
      it("calls deleteUser in dryRun mode and doesn't reject", async () => {
        await registry.preflight('jsmith');

        assert.isFalse(registryMock.sedsDead, 'Sed should not be dead after preflight');
      });
    });
    describe('#deleteUser(username)', () => {
      it.skip('deletes the user', async () => {
        await registry.deleteUser('jsmith');
      });
    });
  });
});

const express = require('express');

class MockRegistry {
  server: *; 
  sedsDead: boolean; 

  constructor() {
    this.sedsDead = false; 
  }

  async start(host: string, port: number) { 
    const app = express(); 
    
    app.delete('/users/jsmith', (req: express$Request, res) => {
      const dryRun = req.query.dryRun === 'true';
      
      if (! dryRun) this.sedsDead = true; 

      res.status(200).send({});
    });

    await bluebird.fromCallback(
      cb => this.server = app.listen(port, host, 512, cb));
  }
  async stop() { 
    const server = this.server; 
    this.server = null; 

    if (server == null) 
      throw new Error('Nothing to stop, no server here.'); 
      
    server.unref(); 
    await bluebird.fromCallback(
      cb => server.close(cb));
  }
}