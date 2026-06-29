/*
 * Copyright (c) 2026 Digital Bazaar, Inc.
 */
import * as bedrock from '@bedrock/core';
import {asyncHandler, middleware} from '@bedrock/express';
import {hashDocument} from '../lib/hasher.js';
import {randomUUID} from 'node:crypto';

import '@bedrock/https-agent';
import '@bedrock/token-query-coordinator';

const {acceptableContent} = middleware;
const {util: {BedrockError}} = bedrock;

const TOKENIZER_ID = `urn:uuid:${randomUUID()}`;
const TOKEN_REQUESTERS = new Map();

const PAIRWISE_TO_ID = new Map();
const QUERY_TOKENS = new Map();

bedrock.events.on('bedrock-express.configure.routes', app => {
  // create a mock token-requester instance
  app.post('/mock/token-requesters',
    acceptableContent('json'),
    asyncHandler(async (req, res) => {
      const {controller} = req.body;
      const baseUrl = `${bedrock.config.server.baseUri}/mock/token-requesters`;
      const localId = randomUUID();
      const config = {
        id: `${baseUrl}/${localId}`,
        controller
      };
      TOKEN_REQUESTERS.set(localId, {config, pairwiseMap: new Map()});
      res.json(config);
    }));
  // mock tokenize a document
  app.post('/mock/token-requesters/:localId/tokenize',
    acceptableContent('json'),
    asyncHandler(async (req, res) => {
      const {localId} = req.params;
      const tokenRequester = _getTokenRequester({localId});
      const {document} = req.body;
      const tokenizedId = `${TOKENIZER_ID}:${hashDocument({document})}`;
      let pairwiseToken = PAIRWISE_TO_ID.get(tokenizedId);
      if(!pairwiseToken) {
        pairwiseToken = `${TOKENIZER_ID}:${randomUUID()}`;
        tokenRequester.pairwiseMap.set(tokenizedId, pairwiseToken);
        PAIRWISE_TO_ID.set(pairwiseToken, tokenizedId);
      }
      res.json({pairwiseToken});
    }));
  // mock connect the entity a pairwise token refers to to a query token
  app.post('/mock/token-requesters/:localId/connect',
    acceptableContent('json'),
    asyncHandler(async (req, res) => {
      const {localId} = req.params;
      _getTokenRequester({localId});
      const {pairwiseToken} = req.body;
      const tokenizedId = PAIRWISE_TO_ID.get(pairwiseToken);
      if(!tokenizedId) {
        throw _createNotFoundError('Pairwise token');
      }
      const queryToken = `${TOKENIZER_ID}:${randomUUID()}`;
      QUERY_TOKENS.set(queryToken, {tokenizedId, requester: null});
      res.json({tokens: [queryToken]});
    }));
  // mock resolve a pairwise token
  app.post('/mock/token-requesters/:localId/resolve',
    acceptableContent('json'),
    asyncHandler(async (req, res) => {
      const {localId} = req.params;
      const tokenRequester = _getTokenRequester({localId});
      const {token} = req.body;
      const resolution = QUERY_TOKENS.get(token);
      if(!resolution) {
        throw _createNotFoundError('Query token');
      }
      const {tokenizedId} = resolution;
      let pairwiseToken;
      if(resolution.requester === null) {
        resolution.requester = localId;
        pairwiseToken = tokenRequester.pairwiseMap.get(tokenizedId);
        if(!pairwiseToken) {
          pairwiseToken = `${TOKENIZER_ID}:${randomUUID()}`;
          tokenRequester.pairwiseMap.set(tokenizedId, pairwiseToken);
          PAIRWISE_TO_ID.set(pairwiseToken, tokenizedId);
        }
      } else if(resolution.requester === localId) {
        pairwiseToken = tokenRequester.pairwiseMap.get(tokenizedId);
      } else {
        throw new BedrockError('Token already resolved.', {
          name: 'NotAllowedError',
          details: {
            httpStatusCode: 403,
            public: true
          }
        });
      }
      res.json({pairwiseToken});
    }));
});

import '@bedrock/test';
bedrock.start();

function _getTokenRequester({localId}) {
  const tokenRequester = TOKEN_REQUESTERS.get(localId);
  if(!tokenRequester) {
    throw _createNotFoundError('Token requester instance');
  }
  return tokenRequester;
}

function _createNotFoundError(prefix) {
  return new BedrockError(`${prefix} not found.`, {
    name: 'NotFoundError',
    details: {
      httpStatusCode: 404,
      public: true
    }
  });
}
