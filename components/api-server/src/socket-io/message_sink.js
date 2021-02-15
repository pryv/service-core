/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

// A consumer for our kind of notification messages. 
// 
export interface MessageSink {
  deliver(userName: string, message: string | {}): void; 
}
