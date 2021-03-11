/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const path = require('path');

module.exports = {
  eventFiles: {
    attachmentsDirPath: path.join(__dirname, '../../../../../service-core-files/attachments'),
    previewsDirPath: path.join(__dirname, '../../../../../service-core-files/previews')
  },
  customExtensions: {
    defaultFolder: path.join(__dirname, '../../../../custom-extensions')
  },
  audit: {
    storage: {
      path: path.join(__dirname, '../../../../../service-core-files/audit')
    }
  }
}