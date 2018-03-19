// @flow

/* global describe, it, beforeEach, afterEach */

const tmp = require('tmp');
const path = require('path');
const fs = require('fs');
const chai = require('chai');
const assert = chai.assert; 

const rpc = require('../../src/index.js');

describe('Type Compilation', () => {
  let tempdir; 
  
  beforeEach(() => {
    tempdir = tmp.dirSync({ unsafeCleanup: true }); 
  });
  afterEach(() => {
    tempdir.removeCallback(); 
  });
  
  it('compiles a .proto 3 syntax file into a set of flow-type interfaces', () => {
    const definition = rpc.load('../fixtures/base.proto');
    
    // Write the (flow type) signature to the tempdir
    definition.writeTypeSignature('base.js.flow', tempdir.name);
    
    const typesigPath = path.join(tempdir.name, 'base.js.flow');
    
    const stat = fs.statSync(typesigPath);
    assert.isTrue(stat.isFile());
  });
});