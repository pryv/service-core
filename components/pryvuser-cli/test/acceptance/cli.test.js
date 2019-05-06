// @flow

/* global describe, it */

const bluebird = require('bluebird');
const child_process = require('child_process');
const path = require('path');

const chai = require('chai');
const assert = chai.assert;

describe('CLI application', () => {
  it('TLUE-prints help and usage when called with no arguments', async () => {
    const output = await cli();
    assert.match(output, /Commands:/); 
    assert.match(output, /delete-user <username>/); 
  });
});

async function cli(...args: Array<string>): Promise<string> {
  const cmd = path.join(__dirname, '../../bin/cli') + ' ' + args.join(' '); 
  const opts = {}; 

  const stdout = await bluebird.fromCallback(cb => {
    child_process.exec(cmd, opts, (err, stdout, stderr) => { // eslint-disable-line no-unused-vars
      return cb(err, stdout);
    });
  });

  return stdout;
}