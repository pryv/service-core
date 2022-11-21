/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

import type Context from '../../context';
import type { Span } from 'opentracing';

// A small class that helps clean up the tracing code in the controller code
// above.
//
class TracedOperations {
  ongoingOps: Map<string, Span>;

  context: Context;

  constructor(context: Context) {
    this.ongoingOps = new Map();

    this.context = context;
  }

  start(name: string, opts?: any) {
    const ongoing = this.ongoingOps;
    const ctx = this.context;

    const span = ctx.childSpan(name, opts);
    ongoing.set(name, span);
  }
  finish(name: string) {
    const ongoing = this.ongoingOps;

    const span = ongoing.get(name);

    if (span == null)
      throw new Error(
        `Tried to finish span '${name}', but no such ongoing span.`
      );

    span.finish();
  }
}

module.exports = TracedOperations;
