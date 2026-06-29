/*
 * Copyright (c) 2026 Digital Bazaar, Inc.
 */
import {config} from '@bedrock/core';
import path from 'node:path';
import '@bedrock/mongodb';
import '@bedrock/token-query-coordinator';

config.mocha.tests.push(path.join(import.meta.dirname, 'mocha'));

// mongodb config
config.mongodb.name = 'bedrock_token_query_coordinator_test';
config.mongodb.host = 'localhost';
config.mongodb.port = 27017;
// drop all collections on initialization
config.mongodb.dropCollections = {};
config.mongodb.dropCollections.onInit = true;
config.mongodb.dropCollections.collections = [];

// allow self-signed certs in test framework
config['https-agent'].rejectUnauthorized = false;

// for testing served queries
const servedQueriesCfg = config['token-query-coordinator'].servedQueries;
servedQueriesCfg.enabled = true;
servedQueriesCfg.queryTypes = {
  'test-mock-tokenizer': {
    documentType: 'SharedType',
    returnFilter: {
      relatedFields: ['testField2', 'testField3']
    }
  }
};
// set a `resolveToken` zcap that will be overwritten in tests but will parse
// as valid
servedQueriesCfg.tokenClient.zcaps.resolveToken =
  `urn:zcap:root:${encodeURIComponent('https://localhost:22443/example')}`;
