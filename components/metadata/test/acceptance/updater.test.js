// @flow

// A test for the updater service. 

/* global describe, it, before, after */

const Long = require('long');

const chai = require('chai');
const assert = chai.assert; 

const helpers = require('./test-helpers');

const rpc = require('components/tprpc');
const metadata = require('components/metadata');

import type { IMetadataUpdaterService } from '../../src/metadata_updater/interface';

describe('Metadata Updater', () => {  
  // Set up the server end
  let server; 
  before(async () => {
    server = await helpers.spawnContext.spawn();
  });
  after(() => {
    server.stop();
  });
  
  // Set up the client end of the service. 
  let service : IMetadataUpdaterService; 
  before(async () => {
    const definition = await metadata.updater.definition;
    const client = new rpc.Client(definition);

    service = client.proxy('MetadataUpdaterService', `127.0.0.1:${server.port}`);
  });
  
  it('allows scheduling an update', async () => {
    const now: number = new Date() / 1e3; // now in seconds
    
    await service.scheduleUpdate({
      userId: 'userName', 
      eventId: 'eventId', 
      
      author: 'accessToken', 
      timestamp: now, 
      dataExtent: {
        from: now,
        to: now, 
      }
    });
    
    const update = await service.getPendingUpdate({
      userId: 'userName', 
      eventId: 'eventId', 
    });
    
    assert.isTrue(update.found);
    
    const deadline = Long.fromValue(update.deadline);
    const min15 = 15 * 60;
    assert.approximately(deadline, (now + min15), 2);
  });
});