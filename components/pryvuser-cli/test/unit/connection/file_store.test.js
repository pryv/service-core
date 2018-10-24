// @flow

/* global describe, it, beforeEach */

const chai = require('chai');
const assert = chai.assert; 

import type { FileStoreSettings } from '../../../src/configuration'; 
const FileStore = require('../../../src/connection/file_store');

describe('Connection/FileStore', () => {
  describe('when given a users files', () => {
    const settings: FileStoreSettings = {
      attachmentsPath: '/foo/bar', 
      previewsPath: '/foo/baz', 
    };

    let fileStore; 
    beforeEach(() => {
      fileStore = new FileStore(settings);
    });


    describe('#preflight(username)', () => {
      it('works', async () => {
        await fileStore.preflight('jsmith');
      });
      it.skip("fails when this process doesn't have the right kind of access", () => {
        resolvesWithError(
          () => fileStore.preflight('jsmith')
        );
      });
    });
    describe('#deleteUser(username)', () => {
      it.skip("deletes the user's files", () => {
        
      });
    });
  });
});

async function resolvesWithError(fun: () => Promise<void>) {
  let erroredOut = false; 
  try {
    fun(); 
  }
  catch (err) {
    erroredOut = true; 
  }

  assert.isTrue(erroredOut);
}