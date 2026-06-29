/*!
 * Copyright (c) 2026 Digital Bazaar, Inc.
 */
import * as bedrock from '@bedrock/core';
import assert from 'assert-plus';
import {getAppIdentity} from '@bedrock/app-identity';
import {getServiceObjectId} from '../helpers.js';
import {logger} from '../logger.js';
import {namespace} from '../config.js';
import {storage} from './tokenizedDocuments.js';
import {TokenClient} from '../TokenClient.js';
import {zcapClient} from '@bedrock/app-identity';

const {util: {BedrockError}} = bedrock;

let QUERY_CONFIGS;
let TOKEN_CLIENT;

bedrock.events.on('bedrock.init', async () => {
  _processServedQueriesConfig();
});

/**
 * Gets the served query configuration for the given query type.
 *
 * @param {object} options - The options to use.
 * @param {string} options.queryType - The query type to get the definition for.
 *
 * @returns {Promise<object>} An object with a `config` property containing
 *   the served query configuration.
 */
export async function get({queryType} = {}) {
  assert.string(queryType, 'queryType');
  return structuredClone(_getServedQueryConfig({queryType}));
}

/**
 * Processes a query of the given type with the given query token.
 *
 * @param {object} options - The options to use.
 * @param {string} options.queryType - The query type.
 * @param {string} options.queryToken - The query token to use.
 *
 * @returns {Promise<object>} An object with the query result in `result`.
 */
export async function processQuery({queryType, queryToken} = {}) {
  // first get the matching query definition
  const {
    definition: {documentType, returnFilter}
  } = await get({queryType});

  // next, resolve token to a pairwise token
  let pairwiseToken;
  try {
    const cfg = bedrock.config[namespace];
    const resolveZcap = _getResolveZcap({
      zcap: cfg.servedQueries.tokenClient.zcaps.resolveToken
    });
    ({pairwiseToken} = await TOKEN_CLIENT.resolve({queryToken, resolveZcap}));
  } catch(error) {
    logger.error(error.message, {error});
    throw new BedrockError(
      'Could not resolve query token.', {
        name: 'OperationError',
        details: {httpStatusCode: 500, public: true}
      });
  }

  // finally, check for a match, including the expected `documentType`
  const records = await storage.find({
    documentType,
    query: {'tokenizedDocument.id': pairwiseToken},
    options: {limit: 1}
  });
  if(records.length === 0) {
    throw new BedrockError('Tokenized document not found.', {
      name: 'NotFoundError',
      details: {httpStatusCode: 404, public: true}
    });
  }
  // filter result
  const [{tokenizedDocument}] = records;
  const relatedFields = {};
  const filter = new Set(returnFilter.relatedFields);
  for(const [field, value] of Object.entries(tokenizedDocument.relatedFields)) {
    if(filter.has(field)) {
      relatedFields[field] = value;
    }
  }
  return {
    result: {
      results: [{documentType, relatedFields}],
      hasMore: false
    }
  };
}

function _processServedQueriesConfig() {
  const cfg = bedrock.config[namespace];

  // served queries are optional, return early if not enabled
  if(!cfg.servedQueries.enabled) {
    return;
  }

  const {id: controller} = getAppIdentity();

  // parse query types when enabled
  const {queryTypes = {}} = cfg.servedQueries;
  QUERY_CONFIGS = new Map();
  for(const [queryType, definition] of Object.entries(queryTypes)) {
    _validateQueryTypeDefinition({queryType, definition});
    QUERY_CONFIGS.set(queryType, {
      id: getServiceObjectId({
        routePrefix: '/query-types', localId: encodeURIComponent(queryType)
      }),
      controller,
      definition: structuredClone(definition),
      oauth2: {
        // FIXME: populate
        issuerConfigUrl: ''
      }
    });
  }

  // ensure a valid `resolveToken` zcap has been configured
  _getResolveZcap({zcap: cfg.servedQueries.tokenClient.zcaps.resolveToken});

  // set up token client
  TOKEN_CLIENT = new TokenClient({zcapClient});
}

function _getResolveZcap({zcap}) {
  try {
    // parse from JSON
    if(typeof zcap === 'string' && zcap.startsWith('{')) {
      zcap = JSON.parse(zcap);
    }
    // validate invocation target
    TokenClient.getInvocationTarget({zcap});
    return zcap;
  } catch(cause) {
    throw new BedrockError(
      'No valid "resolveToken" capability configured.', {
        name: 'OperationError',
        details: {httpStatusCode: 500, public: true},
        cause
      });
  }
}

function _getServedQueryConfig({queryType}) {
  const config = QUERY_CONFIGS?.get(queryType);
  if(!config) {
    throw new BedrockError(
      `Served query configuration for "${queryType}" not found.`, {
        name: 'NotFoundError',
        details: {httpStatusCode: 404, public: true}
      });
  }
  return config;
}

function _validateQueryTypeDefinition({queryType, definition}) {
  const {documentType, returnFilter} = definition;
  assert.string(documentType, `${queryType}.documentType`);
  assert.object(returnFilter, `${queryType}.returnFilter`);
  assert.arrayOfString(
    returnFilter.relatedFields, `${queryType}.returnFilter.relatedFields`);
}
