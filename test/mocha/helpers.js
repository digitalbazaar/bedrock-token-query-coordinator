/*!
 * Copyright (c) 2024-2026 Digital Bazaar, Inc.
 */
import * as bedrock from '@bedrock/core';
import * as process from 'node:process';
import {getAppIdentity, zcapClient} from '@bedrock/app-identity';
import {
  TokenClient, tokenizedDocuments
} from '@bedrock/token-query-coordinator';

const ZCAP_ROOT_PREFIX = 'urn:zcap:root:';

export async function createTokenUser() {
  const {id: controller} = getAppIdentity();

  // create token requester instance for use by controller
  const tokenRequesterConfig = await createTokenRequesterInstance({
    config: {controller}
  });

  const zcaps = {
    rootTokenRequester:
      `${ZCAP_ROOT_PREFIX}${encodeURIComponent(tokenRequesterConfig.id)}`
  };

  const {storage} = tokenizedDocuments;
  const tokenClient = new TokenClient({zcapClient, storage});

  const query = async ({url, pairwiseToken, queryZcap}) => {
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

export async function createTokenRequesterInstance({config} = {}) {
  // if a dev tokenizer URL was given, create a meter ID
  let meterId;
  let url;
  if(process.env.DEV_TOKENIZER_URL) {
    // create a meter; assumes dev-mode for tokenizer system that allows
    // dev app identity zcap client to create meters
    const meter = await _createMeter();
    meterId = meter.id;
    config = {...config, meterId};
    url = `${process.env.DEV_TOKENIZER_URL}/token-requesters`;
  } else {
    const {baseUri: baseUrl} = bedrock.config.server;
    url = `${baseUrl}/mock/token-requesters`;
  }

  if(config.sequence === undefined) {
    config.sequence = 0;
  }
  const response = await zcapClient.write({url, json: config});
  return response.data;
}

async function _createMeter() {
  const {id: controller} = getAppIdentity();
  const url = `${process.env.DEV_TOKENIZER_URL}/meters`;
  const json = {
    controller,
    // FIXME: make configurable / obtainable from tokenizer service
    product: {id: 'urn:uuid:cfb3fed8-d54c-4bd2-ada9-810ec1271f0d'},
    serviceId: 'did:key:z6MkpLAeP33tTCfKmAfwbQ4za5F73x5nUn2PheWMG5tXdwgE'
  };
  const response = await zcapClient.write({url, json});
  const {meter} = response.data;
  meter.id = `${url}/${meter.id}`;
  return meter;
}
