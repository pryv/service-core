// @flow

/* global describe, it, beforeEach, afterEach */
const path = require('path');

const chai = require('chai');

const { assert } = chai;
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
      assert.strictEqual(await pv.version(), '1.2.3');
    });
  });
});
