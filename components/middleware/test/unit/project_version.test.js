// @flow

/* global describe, it, beforeEach, afterEach */
const path = require('path');

const chai = require('chai');
const assert = chai.assert; 
const sinon = require('sinon');

const bluebird = require('bluebird');
const child_process = require('child_process');
const fs = require('fs');

const { ProjectVersion } = require('../../src/project_version');

describe('ProjectVersion#version', () => {
  let pv;
  beforeEach(() => {
    pv = new ProjectVersion(); 
  });
  
  describe('when a ".api-version" file exists in the project', () => {
    const versionFilePath = path.join(__dirname, '../../../../../', '.api-version');

    beforeEach(() => {
      fs.writeFileSync(versionFilePath, '1.2.3');      
    });
    afterEach(() => {
      fs.unlinkSync(versionFilePath);
    });
    
    it('[HV40] reads .api-version and returns that constant', async () => {
      assert.strictEqual(await pv.version(), '1.2.3');
    });
  });
  describe('when neither method works', () => {
    it('[KTG9] throws an error', async () => {
      const failsAlways = sinon.stub(pv, 'exec');
      failsAlways.throws(); 
      
      let thrown = false; 
      try {
        await pv.version();
      }
      catch(err) {
        thrown = true;
      }

      assert.isTrue(thrown);
    });
  });
});