/*!
 * Copyright (c) 2026 Digital Bazaar, Inc.
 */
import * as bedrock from '@bedrock/core';
import {TokenizedDocumentStorage} from './TokenizedDocumentStorage.js';

export let storage;

bedrock.events.on('bedrock.init', async () => {
  storage = new TokenizedDocumentStorage({
    collectionName: `token-query-coordinator-tokenized-document`
  });
});
