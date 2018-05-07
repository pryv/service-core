// @flow

/* global describe, it, beforeEach */

const chai = require('chai');
const assert = chai.assert; 

const bluebird = require('bluebird');
const child_process = require('child_process');

const { ProjectVersion } = require('../../src/project_version');

describe('ProjectVersion#version', () => {
  let pv;
  beforeEach(() => {
    pv = new ProjectVersion(); 
  });
  
  describe('when no ".deploy" file is available', () => {
    it('returns a version-string', async () => {
      const version = await pv.version();
      assert.match(version, /^\d+\.\d+\.\d+(-\d+-[0-9a-z]+)?$/);
    });
    it('returns a git describe string', async () => {
      const exec = (cmd) => bluebird.fromCallback(
        cb => child_process.exec(cmd, cb));
        
      const expected = (await exec('git describe'))
        .slice(0, -1);
      const given = await pv.version();
      
      assert.strictEqual(given, expected);
    });
  });
});