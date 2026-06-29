/*!
 * Copyright (c) 2021-2026 Digital Bazaar, Inc.
 */
import * as bedrock from '@bedrock/core';
import assert from 'assert-plus';

// get a fully qualified service object ID from a `service` and `req` OR
// from a `routePrefix` and `localId`
export function getServiceObjectId({service, req, routePrefix, localId} = {}) {
  let invalid;
  if(service || req) {
    assert.object(service, 'service');
    assert.object(req, 'req');
    if(routePrefix || localId) {
      invalid = true;
    } else {
      ({routePrefix} = service);
      ({localId} = req.params);
    }
  } else if(routePrefix || localId) {
    assert.string(routePrefix, 'routePrefix');
    assert.string(localId, 'localId');
    invalid = !(routePrefix && localId);
  } else {
    invalid = true;
  }
  if(invalid) {
    throw new TypeError(
      '"service" and "req" must be given OR "routePrefix" and "localId"; ' +
      'not both.');
  }
  const {baseUri} = bedrock.config.server;
  return `${baseUri}${routePrefix}/${localId}`;
}
