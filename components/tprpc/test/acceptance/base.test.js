/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

/* global describe, it, before, after, beforeEach, afterEach */


require('@pryv/boiler').init({appName: 'tprpc-test', baseConfigDir: ''});

const chai = require('chai');
const assert = chai.assert; 
const sinon = require('sinon');

const rpc = require('../../src/index.js');

const { Corpus } = require('../fixtures/base');
import type { ISearchService }  from '../fixtures/base';

describe('Base API', () => {
  const endpoint = '127.0.0.1:4020';

  // Loads the service definition
  let definition; 
  before(async () => {
    definition = await rpc.load(__dirname + '/../fixtures/base.proto');
  });
  
  // If nothing else is done, this is the server implementation
  const impl: ISearchService = {
    search: () => {
      return Promise.resolve({
        results: [
          { url: 'http://foo/bar1', title: 'A title 1', snippets: [] }, 
          { url: 'http://foo/bar2', title: 'A title 2', snippets: [] },   
        ]
      });
    }
  };
  
  // Stub allows using sinon-api on the impl#search function.
  let stub;
  beforeEach(() => {
    stub = sinon.stub(impl, 'search');
    stub.callThrough();
  });
  afterEach(() => {
    stub.restore();
  });
  
  // RPC server, serving impl
  let server; 
  before(async () => {
    server = new rpc.Server();
    server.add(definition, 'SearchService', (impl: ISearchService));
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
  
  it('[GZFK] making a call', async () => {
    const response = await proxy.search({
      query: 'select content from events', 
      pageNumber: 1, 
      resultPerPage: 10, 
      corpus: Corpus.WEB, 
    });
  
    sinon.assert.calledOnce(impl.search);
    sinon.assert.calledWith(impl.search, 
      sinon.match({ query: 'select content from events' }));

    sinon.assert.calledOn(impl.search, impl);
  
    // Don't think too hard about this, it's all hard coded.
    assert.strictEqual(response.results.length, 2); 
    
    const res0 = response.results[0];
    assert.strictEqual(res0.title, 'A title 1');
    const res1 = response.results[1];
    assert.strictEqual(res1.title, 'A title 2');
  });
  it('[V7MJ] failing a call (server-side)', async () => {
    stub.throws(new Error('server-side error'));
          
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
      
      assert.strictEqual(err.message, '(remote error) Error: server-side error');
    }
    
    assert.isTrue(caught);
  });
});