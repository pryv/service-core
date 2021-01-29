/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
var fs = require('fs');
const { getConfig } = require('@pryv/boiler');

exports.mochaHooks = {
  async beforeAll () {
    const config = await getConfig();

    // create preview directories that would notmally be created in normal setup
    const attachmentsDirPath = config.get('eventFiles:attachmentsDirPath');
    const previewsDirPath = config.get('eventFiles:previewsDirPath');

    if (!fs.existsSync(attachmentsDirPath)) {
      fs.mkdirSync(attachmentsDirPath, { recursive: true });
    }
    if (!fs.existsSync(previewsDirPath)) {
      fs.mkdirSync(previewsDirPath, { recursive: true });
    }
  },
};