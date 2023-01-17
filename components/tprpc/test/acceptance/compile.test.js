/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const temp = require('temp').track();
const path = require('path');
const fs = require('fs');
const chai = require('chai');
const assert = chai.assert;
const logger = require('@pryv/boiler').getLogger('compile.test');
const rpc = require('tprpc');

describe('Type Compilation', function () {
  let tmpDirPath;
  beforeEach(() => {
    tmpDirPath = temp.mkdirSync();
  });
  afterEach(() => {
    temp.cleanupSync();
  });
  it('[0YBR] compiles a .proto 3 syntax file into a set of flow-type interfaces', async () => {
    const fullPath = path.join(__dirname, '../fixtures/base.proto');
    const definition = await rpc.load(fullPath);
    // Write the (flow type) signature to the temp dir
    definition.writeTypeSignature('base.js.flow', tmpDirPath);
    const typesigPath = path.join(tmpDirPath, 'base.js.flow');
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
/**
 * @param {string} path
 * @param {string} content
 * @returns {Promise<void>}
 */
async function assertContains (path, content) {
  const lines = content.split('\n');
  // Discard all empty lines from head of `lines`.
  const blank = (s) => /^\s*$/.test(s);
  // remove blank lines from the head of lines
  while (lines.length > 0 && blank(lines[0])) { lines.shift(); }
  // remove blank lines from the tail of lines
  while (lines.length > 0 && blank(lines[lines.length - 1])) { lines.pop(); }
  // If nothing is left, the expectation was empty. That's an error, because
  // it makes no sense.
  if (lines.length <= 0) { throw new Error('No lines in expectation, failing.'); }
  // assert: lines is not empty and lines[0] is not blank
  const mdIndent = lines[0].match(/^(\s*)/);
  if (mdIndent == null) { throw new Error('AF: should not be null here.'); }
  const indent = mdIndent[0].length;
  logger.debug('indent is', indent);
  // Now prepare to be awed by my api juggling skills.
  const buffer = await readFile(path);
  const inputLines = buffer.split('\n');
  // Insert implementation of Boyer-Moore here. For extra points, construct
  // a DFA and search for the expectation using a single streamed pass over
  // the input file.
  for (let i = 0; i < inputLines.length; i++) {
    // eslint-disable-next-line no-labels
    matchAttempt: {
      for (let j = 0; j < lines.length; j++) {
        const line = inputLines[i + j];
        const expectedRaw = lines[j];
        const expected = expectedRaw.slice(indent, expectedRaw.length);
        if (line !== expected) { break matchAttempt; } // eslint-disable-line no-labels
      }
      // We've matched all of lines against inputLines at position i.
      return;
    }
  }
  throw new Error(`File ${path} doesn't contain the string anywhere.`);
}
// Reads a file assuming it is utf8 text.
//
/**
 * @param {string} path
 * @returns {Promise<string>}
 */
async function readFile (path) {
  const stat = await fs.statSync(path);
  const fd = await fs.openSync(path, 'r');
  const buffer = Buffer.alloc(stat.size);
  fs.readSync(fd, buffer, 0, stat.size, 0);
  fs.closeSync(fd);
  return buffer.toString();
}
