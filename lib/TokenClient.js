/*!
 * Copyright (c) 2026 Digital Bazaar, Inc.
 */
import assert from 'assert-plus';
import {hashDocument} from './hasher.js';

const ZCAP_ROOT_PREFIX = 'urn:zcap:root:';

export class TokenClient {
  /**
   * Creates a new TokenClient API. A `TokenClient` instance can be used to
   * tokenize documents for the purpose of storage and/or performing queries.
   *
   * @param {object} options - The options to use.
   * @param {object} options.zcapClient - The zcap client to use when
   *   tokenizing documents or performing queries.
   * @param {object} [options.storage] - A storage object with a
   *   `TokenizedDocumentStorage` interface; if not provided, then the
   *   `upsert()` API will throw if it called.
   *
   * @returns {TokenClient} A `TokenClient` instance.
   */
  constructor({zcapClient, storage} = {}) {
    assert.object(zcapClient, 'zcapClient');
    assert.optionalObject(storage, 'storage');
    this.zcapClient = zcapClient;
    this.storage = storage;
  }

  /**
   * Creates a single use query token to connect with another token client on a
   * shared document.
   *
   * @param {object} options - The options to use.
   * @param {string} options.pairwiseToken - The pairwise token for the
   *   document.
   * @param {object} options.connectZcap - The connect zcap to use to
   *   get a query token from a tokenizer.
   *
   * @returns {Promise<object>} An object with `queryToken` as a key.
   */
  async connect({pairwiseToken, connectZcap} = {}) {
    const invocationTarget = TokenClient.getInvocationTarget({
      zcap: connectZcap
    });
    const url = invocationTarget.endsWith('/connect') ?
      invocationTarget : `${invocationTarget}/connect`;

    const response = await this.zcapClient.write({
      url, capability: connectZcap, json: {pairwiseToken}
    });
    const {tokens: [token]} = response.data;
    return {queryToken: token};
  }

  /**
   * Resolves a single use query token from another token client to a pairwise
   * token. Once resolved by a particular token client to a pairwise token, it
   * cannot be resolved again by a different token client.
   *
   * @param {object} options - The options to use.
   * @param {string} options.queryToken - The single use query token to resolve.
   * @param {object} options.resolveZcap - The connect zcap to use to
   *   get a query token from a tokenizer.
   *
   * @returns {Promise<object>} An object with `pairwiseToken` as a key.
   */
  async resolve({queryToken, resolveZcap} = {}) {
    const invocationTarget = TokenClient.getInvocationTarget({
      zcap: resolveZcap
    });
    const url = invocationTarget.endsWith('/resolve') ?
      invocationTarget : `${invocationTarget}/resolve`;

    const response = await this.zcapClient.write({
      url, capability: resolveZcap, json: {token: queryToken}
    });
    return response.data;
  }

  /**
   * Tokenizes a document, producing a `pairwiseToken`.
   *
   * @param {object} options - The options to use.
   * @param {object} options.document - The document to tokenize; it must have
   *   a `type` field and the value of this field will be stored along with the
   *   tokenized document.
   * @param {object} options.tokenizeZcap - The tokenize zcap to use to get
   *   a pairwise token from a tokenizer.
   *
   * @returns {Promise<object>} An object with `pairwiseToken` as a key.
   */
  async tokenize({document, tokenizeZcap} = {}) {
    const invocationTarget = TokenClient.getInvocationTarget({
      zcap: tokenizeZcap
    });
    const url = invocationTarget.endsWith('/tokenize') ?
      invocationTarget : `${invocationTarget}/tokenize`;

    // hash document and tokenize result
    const digestMultibase = hashDocument({document});
    document = {digestMultibase};
    const response = await this.zcapClient.write({
      url, capability: tokenizeZcap, json: {document}
    });
    return response.data;
  }

  /**
   * Tokenizes and then inserts or updates a document into storage. If the
   * document already exists, its existing `relatedFields` will be updated with
   * the passed `relatedFields`, adding new keys, overwriting existing key
   * values, and leaving existing non-matching keys alone.
   *
   * @param {object} options - The options to use.
   * @param {object} options.document - The document to tokenize; it must have
   *   a `type` field and the value of this field will be stored along with the
   *   tokenized document.
   * @param {object} [options.relatedFields] - Any related fields to store with
   *   the tokenized document.
   * @param {object} options.tokenizeZcap - The tokenize zcap to use.
   *
   * @returns {Promise<object>} Resolves to an object with `pairwiseToken` set
   *   once the operation completes.
   */
  async upsert({document, relatedFields = {}, tokenizeZcap} = {}) {
    assert.object(document, 'document');
    assert.string(document.type, 'document.type');
    assert.object(relatedFields, 'relatedFields');

    // tokenize the document
    const {pairwiseToken} = await this.tokenize({document, tokenizeZcap});
    const tokenizedDocument = {
      sequence: 0,
      id: pairwiseToken,
      documentType: document.type,
      relatedFields
    };

    // upsert the document
    await this.storage.upsert({tokenizedDocument});
    return {pairwiseToken};
  }

  /**
   * Returns all matches for the given `pairwiseToken` using the given
   * `connectZcap` (to create a query token) and `queryZcap` to perform the
   * query.
   *
   * @param {object} options - The options to use.
   * @param {string} [options.url] - Optional URL to use for the endpoint to
   *   query; only optional if the given `queryZcap` has an `invocationTarget`
   *   that expresses the query endpoint.
   * @param {string} options.pairwiseToken - The pairwise token to use.
   * @param {object} options.connectZcap - The connect zcap to use.
   * @param {object} options.queryZcap - The query zcap to use.
   *
   * @returns {Promise<object>} An object with a `results` array of matches and
   *   optional metadata fields like `hasMore: true|false` and `cursor`.
   */
  async query({url, pairwiseToken, connectZcap, queryZcap}) {
    assert.string(pairwiseToken, 'pairwiseToken');

    // build query URL
    url = url ?? TokenClient.getInvocationTarget({zcap: queryZcap});

    // get query token
    const {queryToken} = await this.connect({pairwiseToken, connectZcap});

    // perform query
    const response = await this.zcapClient.write({
      url, capability: queryZcap, json: {queryToken}
    });
    return response.data;
  }

  static getInvocationTarget({zcap}) {
    const zcapType = typeof zcap;
    const isString = zcapType === 'string';
    if(!(isString || zcapType === 'object')) {
      throw new TypeError('"zcap" must be a string or object.');
    }
    const invocationTarget = isString ?
      decodeURIComponent(zcap.slice(ZCAP_ROOT_PREFIX.length)) :
      zcap?.invocationTarget;
    const parsed = URL.parse(invocationTarget);
    if(parsed?.protocol !== 'https:') {
      throw new Error('Capability "invocationTarget" must be an HTTPS URL.');
    }
    return invocationTarget;
  }
}
