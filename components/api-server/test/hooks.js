/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
var fs = require('fs');
const { getGifnoc } = require('boiler');

exports.mochaHooks = {
  async beforeAll () {
    const gifnoc = await getGifnoc();

    // create preview directories that would notmally be created in normal setup
    const attachmentsDirPath = gifnoc.get('eventFiles:attachmentsDirPath');
    const previewsDirPath = gifnoc.get('eventFiles:previewsDirPath');

    if (!fs.existsSync(attachmentsDirPath)) {
      fs.mkdirSync(attachmentsDirPath, { recursive: true });
    }
    if (!fs.existsSync(previewsDirPath)) {
      fs.mkdirSync(previewsDirPath, { recursive: true });
    }
  },
};