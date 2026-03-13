/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

/**
 * Feature flag property names used on system stream config objects.
 * Shared between the config plugin (api-server) and the serializer (business).
 */
module.exports = {
  IS_SHOWN: 'isShown',
  IS_INDEXED: 'isIndexed',
  IS_EDITABLE: 'isEditable',
  IS_UNIQUE: 'isUnique',
  IS_REQUIRED_IN_VALIDATION: 'isRequiredInValidation',
  REGEX_VALIDATION: 'regexValidation'
};
