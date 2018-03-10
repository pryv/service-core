
// @flow

const { createNamespace } = require('cls-hooked');

import type { Span } from 'opentracing';

const CLS_TRACE_SPAN = 'rootSpan';
const session = createNamespace('tracing/cls');

// Continuation Local Storage, built on top of cls-hooked, which implements the
// basic mechanism. This is just used to type the use and to render the actual
// technique opaque to our code.    
// 
class Cls {
  setRootSpan(span: Span) {
    session.set(CLS_TRACE_SPAN, span);
  }
  
  getRootSpan(): ?Span {
    return session.get(CLS_TRACE_SPAN);
  }
  
  startExpressContext(req: express$Request, res: express$Response, next: express$NextFunction) {
    return session.runAndReturn(() => {
      session.bindEmitter(req);
      session.bindEmitter(res);
      
      return next(); 
    });
  }
}

module.exports = new Cls();
