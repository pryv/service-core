/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */
module.exports = {
  serializer: require('./serializer')
};

/**
 * @typedef {Stream & {
 *   isIndexed: boolean;
 *   isUnique: boolean;
 *   isShown: boolean;
 *   isEditable: boolean;
 *   isRequiredInValidation: boolean;
 * }} SystemStream
 */
