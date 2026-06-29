/*!
 * Copyright (c) 2018-2026 Digital Bazaar, Inc.
 */
import * as brZCapStorage from '@bedrock/zcap-storage';
import * as middleware from './middleware.js';
import {asyncHandler} from '@bedrock/express';
import cors from 'cors';
import {getServiceObjectId} from '../helpers.js';
import {
  postRevocationBody
} from '../../schemas/bedrock-token-query-coordinator.js';
import {createValidateMiddleware as validate} from '@bedrock/validation';

export function addRoutes({app, service}) {
  const {routePrefix} = service;
  const routes = {
    revocations: `${routePrefix}/:localId/zcaps/revocations/:revocationId`
  };

  /* Note: CORS is used on all endpoints. This is safe because authorization
  uses HTTP signatures + capabilities, not cookies; CSRF is not possible. */

  // insert a revocation
  app.options(routes.revocations, cors());
  app.post(
    routes.revocations,
    cors(),
    validate({bodySchema: postRevocationBody}),
    middleware.createGetConfigMiddleware({service}),
    middleware.authorizeZcapRevocation({service}),
    asyncHandler(async (req, res) => {
      const {
        body: capability,
        zcapRevocation: {delegator}
      } = req;

      // record revocation
      const id = getServiceObjectId({service, req});
      await brZCapStorage.revocations.insert({
        delegator, rootTarget: id, capability
      });

      res.status(204).end();
    }));
}
