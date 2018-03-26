// @flow

/* global describe, it */

const chai = require('chai');
const assert = chai.assert; 

const rpc = require('../../src/index.js');

const { Corpus } = require('../fixtures/base');
import type { ISearchService } from '../fixtures/base';

describe('Base API', () => {
  it('making a call', async () => {
    const definition = await rpc.load(__dirname + '/../fixtures/base.proto');
    
    const endpoint = '127.0.0.1:4020';
  
    const impl: ISearchService = {
      search: req => {
        assert.strictEqual(req.query, 'select content from events'); 
        return Promise.resolve({
          results: [
            { url: 'http://foo/bar1', title: 'A title 1', snippets: [] }, 
            { url: 'http://foo/bar2', title: 'A title 2', snippets: [] },   
          ]
        });
      }
    };
  
    const server = new rpc.Server();
    server.add(definition, 'SearchService', (impl: ISearchService));
    await server.listen(endpoint);
  
    const client = new rpc.Client(definition);
    const proxy: ISearchService = client.proxy('SearchService', endpoint); 
  
    const response = await proxy.search({
      query: 'select content from events', 
      pageNumber: 1, 
      resultPerPage: 10, 
      corpus: Corpus.WEB, 
    });
    // console.log(response);
  
    // Don't think too hard about this, it's all hard coded.
    assert.strictEqual(response.results.length, 2); 
    
    const res0 = response.results[0];
    assert.strictEqual(res0.title, 'A title 1');
    const res1 = response.results[1];
    assert.strictEqual(res1.title, 'A title 2');
    
    server.close(); 
  });
  it('failing a call (server-side)', async () => {
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