/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

// A test for the updater service. 

/* global describe, it, before, after */

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
  
  it('[POMC] allows scheduling an update', async () => {
    const now: number = new Date() / 1e3; // now in seconds
    
    await service.scheduleUpdate({ entries: [{
      userId: 'userName', 
      eventId: 'eventId', 
      
      author: 'accessToken', 
      timestamp: now, 
      dataExtent: {
        from: now,
        to: now, 
      }
    }]});
    
    const update = await service.getPendingUpdate({
      userId: 'userName', 
      eventId: 'eventId', 
    });
    
    assert.isTrue(update.found);
    
    const deadline = update.deadline;
    const min5 = 5 * 60;    // STALE_LIMIT
    assert.approximately(deadline, (now + min5), 2);
  });
});