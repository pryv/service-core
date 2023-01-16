/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
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
