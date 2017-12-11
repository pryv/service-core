// @flow

// A consumer for our kind of (change) messages. 
// 
export interface MessageSink {
  deliver(userName: string, message: string): void; 
}
