const DELETION_MODES_FIELDS = {
  'keep-everything': [
    'intergrity'
  ],
  'keep-authors': [
    'streamIds',
    'time',
    'duration',
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
    'duration',
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