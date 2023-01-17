/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const DELETION_MODES_FIELDS = {
  'keep-everything': [
    'intergrity'
  ],
  'keep-authors': [
    'streamIds',
    'time',
    'endTime',
    'type',
    'content',
    'description',
    'attachments',
    'clientData',
    'trashed',
    'created',
    'createdBy',
    'integrity'
  ],
  'keep-nothing': [
    'streamIds',
    'time',
    'endTime',
    'type',
    'content',
    'description',
    'attachments',
    'clientData',
    'trashed',
    'created',
    'createdBy',
    'modified',
    'modifiedBy',
    'integrity'
  ]
};

module.exports = DELETION_MODES_FIELDS;