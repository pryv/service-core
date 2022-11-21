/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
import type { Stream } from '../streams';

export type SystemStream = Stream & {
  isIndexed: boolean;
  isUnique: boolean;
  isShown: boolean;
  isEditable: boolean;
  isRequiredInValidation: boolean;
};

module.exports = {
  serializer: require('./serializer'),
};
