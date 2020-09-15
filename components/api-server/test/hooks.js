/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
var fs = require('fs');
const { getConfig } = require('components/api-server/config/Config');
const Settings = require('components/api-server/src/settings');

exports.mochaHooks = {
  async beforeAll () {
    const config = getConfig();
    await config.init();
    const settings = await Settings.load();

    // create preview directories that would notmally be created in normal setup
    const attachmentsDirPath = settings.get('eventFiles.attachmentsDirPath').str();
    const previewsDirPath = settings.get('eventFiles.previewsDirPath').str();
    console.log(attachmentsDirPath,'attachmentsDirPath');
    if (!fs.existsSync(attachmentsDirPath)) {
      fs.mkdirSync(attachmentsDirPath, { recursive: true });
    }
    if (!fs.existsSync(previewsDirPath)) {
      fs.mkdirSync(previewsDirPath, { recursive: true });
    }
  },
};