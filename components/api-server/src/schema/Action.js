/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Lists the possible object actions affecting schema definitions.
 */

const Action = module.exports = {
  CREATE: 'create',
  /**
   * To describe what is actually stored in the DB.
   */
  STORE: 'store',
  READ: 'read',
  UPDATE: 'update'
};
Object.freeze(Action);
