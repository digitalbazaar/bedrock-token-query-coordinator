/*!
 * Copyright (c) 2026 Digital Bazaar, Inc.
 */
import * as bedrock from '@bedrock/core';
import * as middleware from './middleware.js';
import * as revocations from './revocations.js';
import * as servedQueries from '../storage/servedQueries.js';
import {asyncHandler} from '@bedrock/express';
import cors from 'cors';
import {logger} from '../logger.js';
import {namespace} from '../config.js';
import {
  performQueryBody
} from '../../schemas/bedrock-token-query-coordinator.js';
import {createValidateMiddleware as validate} from '@bedrock/validation';

bedrock.events.on('bedrock-express.configure.routes', app => {
  const cfg = bedrock.config[namespace];

  // if no queries are served, do not attach any route handlers
  if(!cfg.servedQueries.enabled) {
    return;
  }

  // define `service`
  const serviceType = 'query-type';
  const routePrefix = `/${serviceType}s`;
  const service = {
    configStorage: {
      // assumes
      async get({id} = {}) {
        const queryType = id.slice(id.lastIndexOf('/') + 1);
        const config = await servedQueries.get({queryType});
        return {config};
      }
    },
    serviceType,
    routePrefix
  };

  // add base service route handlers
  revocations.addRoutes({app, service});

  // add route handlers for service-specific features
  const baseUrl = `${routePrefix}/:localId`;
  const routes = {
    query: `${baseUrl}/query`
  };
  const getConfigMiddleware = middleware.createGetConfigMiddleware({service});

  // performs a query
  app.options(routes.query, cors());
  app.post(
    routes.query,
    cors(),
    validate({bodySchema: performQueryBody}),
    getConfigMiddleware,
    middleware.authorizeServiceObjectRequest(),
    asyncHandler(async (req, res) => {
      try {
        const {localId: queryType} = req.params;
        const {queryToken} = req.body;
        const {result} = await servedQueries.processQuery({
          queryType, queryToken
        });
        res.json(result);
      } catch(error) {
        logger.error(error.message, {error});
        throw error;
      }
    }));
});
