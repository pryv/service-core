// @flow

/**
 * Adds the id of the access (if any was used during API call)
 * within the `Pryv-Access-Id` header of the given result.
 *
 * @param res {express$Response} Current express response. MODIFIED IN PLACE. 
 */
module.exports = function <T: express$Response>(res: T): T {
  // Extracts access id from request context (if any)
  const requestCtx = res.req.context;
  if (requestCtx != null && requestCtx.access != null) {

    res.header('Pryv-Access-Id', requestCtx.access.id);
  }

  return res;
};
