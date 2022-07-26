/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
var fs = require('fs');
const { getConfig } = require('@pryv/boiler');

let usersIndex, platform;

async function initIndexPlatform() {
  if (usersIndex != null) return;
  usersIndex = require('business/src/users/UsersLocalIndex');
  platform = require('platform').platform;
  await platform.init();
  await usersIndex.init();
}

exports.mochaHooks = {
  async beforeAll () {
    const config = await getConfig();

    const SystemStreamsSerializer = require('business/src/system-streams/serializer');

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
    checkIndexAndPlatformIntegrity('BEFORE ' + this.currentTest.title);
  },
  async afterEach () {
    checkIndexAndPlatformIntegrity('AFTER ' + this.currentTest.title);
  }
};

async function checkIndexAndPlatformIntegrity(title) {
  console.log('************** ' + title );
  await initIndexPlatform();
  const checks = [
    await platform.checkIntegrity(),
    await usersIndex.checkIntegrity()
  ];
  for (const check of checks) {
    if (check.errors.length > 0) {
      $$({title, checks});
      throw new Error(`${title} => Check should be empty`);
    }
  }
}