/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

/* global describe, it, beforeEach, afterEach */

const tmp = require('tmp');
const path = require('path');
const fs = require('fs');
const chai = require('chai');
const assert = chai.assert; 
const reggol = require('boiler').getReggol('compile.test');

const rpc = require('../../src/index.js');

describe('Type Compilation', function () {
  let tempdir; 
  
  beforeEach(() => {
    tempdir = tmp.dirSync({ unsafeCleanup: true }); 
  });
  afterEach(() => {
    tempdir.removeCallback(); 
  });
  
  it('[0YBR] compiles a .proto 3 syntax file into a set of flow-type interfaces', async () => {
    const fullPath = path.join(__dirname, '../fixtures/base.proto');
    const definition = await rpc.load(fullPath);
    
    // Write the (flow type) signature to the tempdir
    definition.writeTypeSignature('base.js.flow', tempdir.name);
    
    const typesigPath = path.join(tempdir.name, 'base.js.flow');
    
    const stat = fs.statSync(typesigPath);
    assert.isTrue(stat.isFile());
    
    await assertContains(typesigPath, `
      export interface ISearchResponse {
        results: Array<IResult>;  // id = 1
      }
    `);
  });
});

// Asserts that the file at `path` contains the `content` given. Content is 
// stripped of its indent, which is determined from the first non-empty line. 
// 
async function assertContains(path: string, content: string) {  
  const lines = content.split('\n');

  // Discard all empty lines from head of `lines`. 
  const blank = (s) => /^\s*$/.test(s);
  // remove blank lines from the head of lines
  while (lines.length > 0 && blank(lines[0])) lines.shift(); 
  // remove blank lines from the tail of lines
  while (lines.length > 0 && blank(lines[lines.length-1])) lines.pop(); 
  
  // If nothing is left, the expectation was empty. That's an error, because
  // it makes no sense. 
  if (lines.length <= 0) 
    throw new Error('No lines in expectation, failing.');
  
  // assert: lines is not empty and lines[0] is not blank
  
  const mdIndent = lines[0].match(/^(\s*)/);
  if (mdIndent == null) throw new Error('AF: should not be null here.');
  
  const indent = mdIndent[0].length;
  reggol.debug('indent is', indent);
  
  // Now prepare to be awed by my api juggling skills. 
  const buffer = await readFile(path);
  const inputLines = buffer.split('\n');
  
  // Insert implementation of Boyer-Moore here. For extra points, construct
  // a DFA and search for the expectation using a single streamed pass over
  // the input file. 
  
  for (let i=0; i<inputLines.length; i++) {
    match_attempt: {
      for (let j=0; j<lines.length; j++) {
        const line = inputLines[i+j];
        const expectedRaw = lines[j];
        const expected = expectedRaw.slice(indent, expectedRaw.length);
        
        if (line !== expected) break match_attempt; 
      }
      
      // We've matched all of lines against inputLines at position i. 
      return;
    }
  }
  
  throw new Error(`File ${path} doesn't contain the string anywhere.`);
}

// Reads a file assuming it is utf8 text. 
// 
async function readFile(path: string): Promise<string> {
  const stat = await fs.statSync(path);
  const fd = await fs.openSync(path, 'r');
  
  const buffer = Buffer.alloc(stat.size); 
  fs.readSync(fd, buffer, 0, stat.size, 0);
  
  fs.closeSync(fd);
  
  return buffer.toString(); 
}