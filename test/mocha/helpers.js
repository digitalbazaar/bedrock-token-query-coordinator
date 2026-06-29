/*!
 * Copyright (c) 2024-2026 Digital Bazaar, Inc.
 */
import * as bedrock from '@bedrock/core';
import {getAppIdentity, zcapClient} from '@bedrock/app-identity';
import {
  TokenClient, tokenizedDocuments
} from '@bedrock/token-query-coordinator';
import {agent} from '@bedrock/https-agent';
import {httpClient} from '@digitalbazaar/http-client';

const ZCAP_ROOT_PREFIX = 'urn:zcap:root:';

export async function createMockTokenUser() {
  // create token requester instance to use with token client
  const {id: controller} = getAppIdentity();
  const url = `${bedrock.config.server.baseUri}/mock/token-requesters`;
  const response = await httpClient.post(url, {
    agent,
    json: {controller}
  });
  const tokenRequesterConfig = response.data;

  const zcaps = {
    rootTokenRequester:
      `${ZCAP_ROOT_PREFIX}${encodeURIComponent(tokenRequesterConfig.id)}`
  };

  const {storage} = tokenizedDocuments;
  const tokenClient = new TokenClient({zcapClient, storage});

  const query = async ({url, pairwiseToken, otherTokenClient, queryZcap}) => {
    const connectZcap = zcaps.rootTokenRequester;
    const result = await tokenClient.query({
      url, pairwiseToken, connectZcap, queryZcap
    });
    return result;
  };

  const database = new Map();

  const store = async ({type, fields, localFields}) => {
    const document = {type, fields};
    const tokenizeZcap = zcaps.rootTokenRequester;
    const {pairwiseToken} = await tokenClient.upsert({
      document, relatedFields: localFields, tokenizeZcap
    });
    const record = await storage.get({id: pairwiseToken});
    database.set(pairwiseToken, record);
  };

  return {tokenClient, tokenRequesterConfig, zcaps, query, store, database};
}
