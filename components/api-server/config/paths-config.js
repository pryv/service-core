/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const path = require('path');

module.exports = {
  userFiles: {
    path: path.join(__dirname, '../../../../var-pryv/users')
  },
  eventFiles: {
    attachmentsDirPath: path.join(__dirname, '../../../../var-pryv/attachments'),
    previewsDirPath: path.join(__dirname, '../../../../var-pryv/previews')
  },
  customExtensions: {
    defaultFolder: path.join(__dirname, '../../../../custom-extensions')
  }
}