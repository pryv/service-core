/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

/* global describe, it, beforeEach, afterEach */
const path = require('path');

const chai = require('chai');
const assert = chai.assert;
const sinon = require('sinon');

const bluebird = require('bluebird');
const { execSync } = require('child_process');
const fs = require('fs');

const { getAPIVersion } = require('../../src/project_version');

const versionFilePath = path.join(__dirname, '../../../../../', '.api-version');

describe('APIVersion#version', () => {


  describe('when a ".api-version" file exists in the project and is != that 1.2.3', () => {

    before(() => { 
      const versionRead = fs.writeFileSync(versionFilePath, '1.2.4', { encoding: 'utf-8'});
    });

    after(() => { // put test version back in place
      const versionRead = fs.writeFileSync(versionFilePath, '1.2.3', { encoding: 'utf-8'});
    });

    it('[5ICP] reads .api-version and returns that constant', async () => {
      const version = await getAPIVersion(true);
      assert.strictEqual(version, '1.2.4');
    });
  });


  describe('when a ".api-version" file exists in the project and is 1.2.3', () => {

    before(() => {
      const versionRead = fs.readFileSync(versionFilePath, { encoding: 'utf-8'});
      assert(versionRead === '1.2.3', '.apiversion file content should be 1.2.3');
    });

    it('[HV40] should return git tag version', async () => {
      const version = await getAPIVersion(true);

      try {
        const versionFromGitTag = execSync('git describe --tags').toString().trim();
        assert.strictEqual(version, versionFromGitTag);
      } catch (err) { // test fails in CI because no .git/
        if (! err.message.includes('not a git repository')) assert.fail(err);
      }
      
    });
  });
});