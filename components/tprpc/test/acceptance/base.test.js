// @flow

/* global describe, it */

const chai = require('chai');
const assert = chai.assert; 

const rpc = require('../../src/index.js');

import type { ISearchService } from '../fixtures/base';

describe('Base API', () => {
  it('making a call', async () => {
    const definition = await rpc.load(__dirname + '/../fixtures/base.proto');
    
    const CORPUS_WEB = 1;
    const endpoint = '127.0.0.1:4020';
  
    const impl = {
      search: req => {
        assert.strictEqual(req.query, 'select content from events'); 
        return [
          { url: 'http://foo/bar1', title: 'A title 1', snippets: [] }, 
          { url: 'http://foo/bar2', title: 'A title 2', snippets: [] },   
        ];
      }
    };
  
    const server = new rpc.Server();
    await server.listen(endpoint);
    server.add('SearchService', impl);
  
    const client = new rpc.Client(definition);
    const proxy: ISearchService = client.proxy('SearchService', endpoint); 
  
    const response = await proxy.search({
      query: 'select content from events', 
      page_number: 1, 
      result_per_page: 10, 
      corpus: CORPUS_WEB, 
    });
  
    // Don't think too hard about this, it's all hard coded.
    assert.strictEqual(response.results.length, 2); 
    assert.deepEqual(
      response.results, 
      [
        { url: 'http://foo/bar1', title: 'A title 1', snippets: [] }, 
        { url: 'http://foo/bar2', title: 'A title 2', snippets: [] },   
      ]);
  
    server.close(); 
  });
});