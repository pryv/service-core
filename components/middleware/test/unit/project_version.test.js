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

    it('[HV40] reads .api-version and returns that constant', async () => {
      const versionRead = fs.readFileSync(versionFilePath, { encoding: 'utf-8'});
      assert.strictEqual(pv.version(), versionRead);
    });
  });
});