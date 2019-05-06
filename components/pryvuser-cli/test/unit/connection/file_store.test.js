// @flow

/* global describe, it, beforeEach, afterEach */

const path = require('path');
const fs = require('fs');
const tmp = require('tmp');
const bluebird = require('bluebird');
const chai = require('chai');
const assert = chai.assert; 

import type { FileStoreSettings } from '../../../src/configuration'; 
const FileStore = require('../../../src/connection/file_store');

describe('Connection/FileStore', () => {
  // Stubs for the whole user metadata loading:
  const user = {
    id: 'foobar',
  };
  const userLoader = {
    findUser: () => bluebird.resolve(user),
  };

  describe('when given a users files', () => {
    // Create two random base paths for testing in
    let previewsPath, attachmentsPath;
    beforeEach(() => {
      const opts = { 
        template: '/tmp/tmp-XXXXXX', 
        unsafeCleanup: true 
      };
      previewsPath = tmp.dirSync(opts);
      attachmentsPath = tmp.dirSync(opts);

      fs.mkdirSync(path.join(previewsPath.name, 'foobar'));
      fs.mkdirSync(path.join(attachmentsPath.name, 'foobar'));
    });
    afterEach(() => {
      previewsPath.removeCallback();
      attachmentsPath.removeCallback();
    });

    // Connection settings for the FileStore
    let settings: FileStoreSettings;
    beforeEach(() => {
      settings = {
        attachmentsPath: attachmentsPath.name,
        previewsPath: previewsPath.name,
      };
    });

    let fileStore; 
    beforeEach(() => {
      fileStore = new FileStore(settings, userLoader);
    });


    describe('#preflight(username)', () => {
      it('[V2SN] works', async () => {
        await fileStore.preflight('jsmith');
      });
    });
    describe('#deleteUser(username)', () => {
      it('[2BUQ] deletes the user\'s files', async () => {
        await fileStore.deleteUser('jsmith');        

        // jsmith's user.id happens to be 'foobar': 
        assert.throws(
          () => fs.statSync(path.join(attachmentsPath.name, 'foobar')) );
        assert.throws(
          () => fs.statSync(path.join(previewsPath.name, 'foobar')) );
      });
    });
  });
});
