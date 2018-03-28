// @flow

/* global describe, it, before, after */

const chai = require('chai');
const assert = chai.assert; 
const sinon = require('sinon');

const rpc = require('../../src/index.js');

const { Corpus } = require('../fixtures/base');
import type { ISearchService } from '../fixtures/base';

describe('Base API', () => {
  const endpoint = '127.0.0.1:4020';

  // Loads the service definition
  let definition; 
  before(async () => {
    definition = await rpc.load(__dirname + '/../fixtures/base.proto');
  });
  
  // If nothing else is done, this is the server implementation
  const stub: ISearchService = {
    search: () => {
      return Promise.resolve({
        results: [
          { url: 'http://foo/bar1', title: 'A title 1', snippets: [] }, 
          { url: 'http://foo/bar2', title: 'A title 2', snippets: [] },   
        ]
      });
    }
  };
  
  let server; 
  before(async () => {
    server = new rpc.Server();
    server.add(definition, 'SearchService', (stub: ISearchService));
    await server.listen(endpoint);
  });
  after(() => {
    server.close();
  });
  
  // And this is the client-side object that implements the service. 
  let proxy: ISearchService; 
  before(() => {
    const client = new rpc.Client(definition);
    proxy = client.proxy('SearchService', endpoint); 
  });
  
  it('making a call', async () => {
    sinon.spy(stub, 'search');
    
    const response = await proxy.search({
      query: 'select content from events', 
      pageNumber: 1, 
      resultPerPage: 10, 
      corpus: Corpus.WEB, 
    });
  
    sinon.assert.calledOnce(stub.search);
    sinon.assert.calledWith(stub.search, 
      sinon.match({ query: 'select content from events' }));

    sinon.assert.calledOn(stub.search, stub);
  
    // Don't think too hard about this, it's all hard coded.
    assert.strictEqual(response.results.length, 2); 
    
    const res0 = response.results[0];
    assert.strictEqual(res0.title, 'A title 1');
    const res1 = response.results[1];
    assert.strictEqual(res1.title, 'A title 2');
  });
  it.skip('failing a call (server-side)', async () => {
    const definition = await rpc.load(__dirname + '/../fixtures/base.proto');
    
    const endpoint = '127.0.0.1:4020';
  
    const impl: ISearchService = {
      search: () => {
        throw new Error('server-side error');
      }
    };
  
    const server = new rpc.Server();
    server.add(definition, 'SearchService', (impl: ISearchService));
    await server.listen(endpoint);
  
    const client = new rpc.Client(definition);
    const proxy: ISearchService = client.proxy('SearchService', endpoint); 
      
    let caught = false; 
    try {
      await proxy.search({
        query: 'select content from events', 
        pageNumber: 1, 
        resultPerPage: 10, 
        corpus: Corpus.WEB, 
      });
    }
    catch (err) {
      caught = true; 
      
      assert.strictEqual(err.message, 'Error: server-side error');
    }
    
    assert.isTrue(caught);

    server.close(); 
  });
  
});