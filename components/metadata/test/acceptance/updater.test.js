// @flow

// A test for the updater service. 

/* global describe, it, before, after */

const helpers = require('./test-helpers');

const rpc = require('components/tprpc');
const metadata = require('components/metadata');

describe('Metadata Updater', () => {
  const endpoint = '127.0.0.1:14000';
  
  // Set up the server end
  let server; 
  before(async () => {
    server = await helpers.spawnContext.spawn();
  });
  after(() => {
    server.stop();
  });
  
  // Set up the client end of the service. 
  let service; 
  before(async () => {
    const definition = await metadata.updater.definition;
    const client = new rpc.Client(definition);

    service = client.proxy('MetadataUpdaterService', endpoint);
  });
  
  it('allows scheduling an update', async () => {
    await service.scheduleUpdate({
      userId: 'userName', 
      eventId: 'eventId', 
      
      author: 'accessToken', 
      timestamp: new Date() * 1e9, 
      dataExtent: {
        from: new Date() * 1e9,
        to: new Date() * 1e9, 
      }
    });
  });
});