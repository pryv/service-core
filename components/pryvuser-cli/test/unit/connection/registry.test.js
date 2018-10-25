// @flow

/* global describe, it, beforeEach, afterEach */

import type { RegistrySettings } from '../../../src/configuration';
const Registry = require('../../../src/connection/registry');

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
      url: 'https://foo/bar',
      key: '0123456789',
    };

    let registry; 
    beforeEach(() => {
      registry = new Registry(settings);
    });

    describe('#preflight(username)', () => {
      it("calls deleteUser in dryRun mode and doesn't reject", async () => {
        await registry.preflight('jsmith');
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
  async start(host: string, port: number) { 
    const app = express(); 
    
  }
  async stop() { }
}