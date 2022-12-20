/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const fs = require('fs');
const { getConfig } = require('@pryv/boiler');
const util = require('util');

let usersIndex, platform;

async function initIndexPlatform () {
  if (usersIndex != null) return;
  const { getUsersLocalIndex } = require('storage');
  usersIndex = await getUsersLocalIndex();
  platform = require('platform').platform;
  await platform.init();
}

exports.mochaHooks = {
  async beforeAll () {
    const config = await getConfig();

    // create preview directories that would normally be created in normal setup
    const attachmentsDirPath = config.get('eventFiles:attachmentsDirPath');
    const previewsDirPath = config.get('eventFiles:previewsDirPath');

    if (!fs.existsSync(attachmentsDirPath)) {
      fs.mkdirSync(attachmentsDirPath, { recursive: true });
    }
    if (!fs.existsSync(previewsDirPath)) {
      fs.mkdirSync(previewsDirPath, { recursive: true });
    }
  },
  async beforeEach () {
    await checkIndexAndPlatformIntegrity('BEFORE ' + this.currentTest.title);
  },
  async afterEach () {
    await checkIndexAndPlatformIntegrity('AFTER ' + this.currentTest.title);
  }
};

async function checkIndexAndPlatformIntegrity (title) {
  await initIndexPlatform();
  const checks = [
    await platform.checkIntegrity(),
    await usersIndex.checkIntegrity()
  ];
  for (const check of checks) {
    if (check.errors.length > 0) {
      const checkStr = util.inspect(checks, false, null, true);
      throw new Error(`${title} => Check should be empty \n${checkStr}`);
    }
  }
}
