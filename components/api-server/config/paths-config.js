/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

const path = require('path');

module.exports = {
  userFiles: {
    path: path.join(__dirname, '../../../var-pryv/users')
  },
  eventFiles: {
    attachmentsDirPath: path.join(__dirname, '../../../var-pryv/attachments'),
    previewsDirPath: path.join(__dirname, '../../../var-pryv/previews')
  },
  customExtensions: {
    defaultFolder: path.join(__dirname, '../../../custom-extensions')
  }
};
