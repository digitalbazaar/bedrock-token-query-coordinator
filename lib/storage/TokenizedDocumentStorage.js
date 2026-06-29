/*!
 * Copyright (c) 2026 Digital Bazaar, Inc.
 */
import * as bedrock from '@bedrock/core';
import * as database from '@bedrock/mongodb';
import assert from 'assert-plus';
import {LruCache} from '@digitalbazaar/lru-memoize';
import {namespace} from '../config.js';

const {util: {BedrockError}} = bedrock;

// FIXME: `DocReferenceStorage`?
// FIXME: `docReference`?
// FIXME: `docReference.pairwiseToken`?
export class TokenizedDocumentStorage {
  /**
   * Creates a new TokenizedDocumentStorage API for a particular type of
   * tokenized document.
   *
   * @param {object} options - The options to use.
   * @param {string} options.collectionName - The collection name to use.
   * @param {object} [options.cacheConfig] - The cache config.
   *
   * @returns {TokenizedDocumentStorage} A `TokenizedDocumentStorage` instance.
   */
  constructor({collectionName, cacheConfig} = {}) {
    assert.string(collectionName, 'collectionName');
    assert.optionalObject(cacheConfig, 'cacheConfig');
    if(!cacheConfig) {
      cacheConfig = bedrock.config[namespace].cacheDefaults;
    }

    // coerce `maxSize` w/o `sizeCalculation` to `max`
    if(cacheConfig.maxSize !== undefined &&
      cacheConfig.sizeCalculation === undefined) {
      cacheConfig = {...cacheConfig, max: cacheConfig.maxSize};
      delete cacheConfig.maxSize;
    }

    // coerce `maxAge` to `ttl` in `cacheConfig`
    if(cacheConfig.maxAge !== undefined) {
      cacheConfig = {...cacheConfig, ttl: cacheConfig.maxAge};
      delete cacheConfig.maxAge;
    }

    this.collectionName = collectionName;
    // note: cache is in-memory and process-local
    this.cache = new LruCache(cacheConfig);

    _createStorageInitializer({collectionName});
  }

  /**
   * Inserts a new tokenized document into storage. The `tokenizedDocument.id`
   * property must represent a pairwise token that is the result of tokenizing
   * a document with a type of `tokenizedDocument.documentType`. The
   * `tokenizedDocument.relatedFields` property can include additional
   * key-value pairs related to the document that was tokenized (these fields
   * may or may not be present in the document itself), where keys are strings
   * and values can be of any JSON type.
   *
   * @param {object} options - The options to use.
   * @param {object} options.tokenizedDocument - The tokenized document.
   *
   * @returns {Promise<object>} The database record.
   */
  async insert({tokenizedDocument} = {}) {
    assert.object(tokenizedDocument, 'tokenizedDocument');
    assert.string(tokenizedDocument.id, 'tokenizedDocument.id');
    assert.number(tokenizedDocument.sequence, 'tokenizedDocument.sequence');
    assert.string(
      tokenizedDocument.documentType, 'tokenizedDocument.documentType');

    // require starting sequence to be 0
    if(tokenizedDocument.sequence !== 0) {
      throw new BedrockError('Tokenized document sequence must be "0".', {
        name: 'DataError',
        details: {
          public: true,
          httpStatusCode: 400
        }
      });
    }

    // insert the tokenized document and return the updated record
    const now = Date.now();
    const meta = {created: now, updated: now};
    const record = {meta, tokenizedDocument};
    try {
      const collection = this._getCollection();
      await collection.insertOne(record);
      return record;
    } catch(cause) {
      if(!database.isDuplicateError(cause)) {
        throw cause;
      }
      throw new BedrockError('Duplicate tokenized document.', {
        name: 'DuplicateError',
        details: {public: true, httpStatusCode: 409},
        cause
      });
    }
  }

  /**
   * Retrieves all tokenized document records matching the given query.
   *
   * @param {object} options - The options to use.
   * @param {string} options.documentType - The type of the document that was
   *   tokenized.
   * @param {object} [options.query={}] - The optional query to use.
   * @param {object} [options.options={}] - Query options (eg: 'sort', 'limit').
   * @param {boolean} [options.explain=false] - An optional explain boolean.
   *
   * @returns {Promise<Array> | ExplainObject} The records that matched the
   *   query or an ExplainObject if `explain=true`.
   */
  async find({documentType, query = {}, options = {}, explain = false} = {}) {
    assert.string(documentType, 'documentType');
    // force `documentType` to be included in query
    query = {...query, 'tokenizedDocument.documentType': documentType};
    const collection = this._getCollection();
    const cursor = await collection.find(query, options);

    if(explain) {
      return cursor.explain('executionStats');
    }

    return cursor.toArray();
  }

  /**
   * Gets a tokenized document record.
   *
   * @param {object} options - The options to use.
   * @param {string} options.id - The ID of the tokenized document.
   * @param {boolean} [options.useCache=true] - Set to `true` to use the cache,
   *   `false` not to.
   * @param {boolean} [options.explain=false] - An optional explain boolean.
   *
   * @returns {Promise<object> | ExplainObject} The database record or an
   *   ExplainObject if `explain=true`.
   */
  async get({id, useCache = true, explain = false} = {}) {
    assert.string(id, 'id');

    // skip cache if `!useCache` || `explain=true`
    if(!useCache || explain) {
      return this._getUncachedRecord({id, explain});
    }

    const fn = () => this._getUncachedRecord({id});
    return this.cache.memoize({key: id, fn});
  }

  /**
   * Updates a tokenized document if its sequence number is next.
   *
   * @param {object} options - The options to use.
   * @param {object} options.tokenizedDocument - The tokenized document.
   * @param {boolean} [options.explain=false] - An optional explain boolean.
   *
   * @returns {Promise<object> | ExplainObject} The database record or an
   *   ExplainObject if `explain=true`.
   */
  async update({tokenizedDocument, explain = false} = {}) {
    assert.object(tokenizedDocument, 'tokenizedDocument');
    assert.string(tokenizedDocument.id, 'tokenizedDocument.id');
    assert.number(tokenizedDocument.sequence, tokenizedDocument.sequence);
    assert.string(
      tokenizedDocument.documentType, 'tokenizedDocument.documentType');

    // insert the tokenized document and get the updated record
    const now = Date.now();

    const collection = this._getCollection();
    const query = {
      'tokenizedDocument.id': tokenizedDocument.id,
      'tokenizedDocument.sequence': tokenizedDocument.sequence - 1
    };

    if(explain) {
      // 'find().limit(1)' is used here because 'updateOne()' doesn't return a
      // cursor which allows the use of the explain function
      const cursor = await collection.find(query).limit(1);
      return cursor.explain('executionStats');
    }

    const $set = {tokenizedDocument, 'meta.updated': now};
    const result = await collection.updateOne(query, {$set});
    if(result.modifiedCount === 0) {
      // no records changed...
      throw new BedrockError(
        'Could not update tokenized document. ' +
        'Record sequence does not match or record does not exist.', {
          name: 'InvalidStateError',
          details: {httpStatusCode: 409, public: true}
        });
    }

    // clear local cache
    this.cache.delete(tokenizedDocument.id);

    return true;
  }

  /**
   * Inserts or updates a tokenized document into storage. If the tokenized
   * document already exists, its existing `relatedFields` will be updated with
   * the passed `relatedFields`, adding new keys, overwriting existing key
   * values, and leaving existing non-matching keys alone. For more control
   * over update behavior, use `update()` instead.
   *
   * @param {object} options - The options to use.
   * @param {object} options.tokenizedDocument - The tokenized document.
   *
   * @returns {Promise} Resolves once the operation completes.
   */
  async upsert({tokenizedDocument} = {}) {
    assert.object(tokenizedDocument, 'tokenizedDocument');
    assert.string(tokenizedDocument.id, 'tokenizedDocument.id');
    assert.number(tokenizedDocument.sequence, tokenizedDocument.sequence);
    assert.string(
      tokenizedDocument.documentType, 'tokenizedDocument.documentType');

    // optimize for new documents; attempt insert
    try {
      await this.insert({tokenizedDocument});
    } catch(e) {
      if(e.name !== 'DuplicateError') {
        throw e;
      }
      // drop down to handle duplicate error
    }

    // make shallow copy to allow modification
    tokenizedDocument = {...tokenizedDocument};

    // loop until upserted or error
    while(true) {
      try {
        const existing = await this.get({
          id: tokenizedDocument.id, useCache: false
        });
        tokenizedDocument.sequence = existing.tokenizedDocument.sequence + 1;
        tokenizedDocument.relatedFields = {
          ...existing.tokenizedDocument.relatedFields,
          ...tokenizedDocument.relatedFields
        };
        await this.update({tokenizedDocument});
        return;
      } catch(e) {
        if(e.name === 'InvalidStateError') {
          throw e;
        }
        // loop to try again
      }
    }
  }

  _getCollection() {
    return database.collections[this.collectionName];
  }

  async _getUncachedRecord({id, explain = false}) {
    const collection = this._getCollection();
    const query = {'tokenizedDocument.id': id};
    const projection = {_id: 0, tokenizedDocument: 1, meta: 1};

    if(explain) {
      // 'find().limit(1)' is used here because 'updateOne()' doesn't return a
      // cursor which allows the use of the explain function
      const cursor = await collection.find(query, {projection}).limit(1);
      return cursor.explain('executionStats');
    }

    const record = await collection.findOne(query, {projection});
    if(!record) {
      throw new BedrockError('Tokenized document not found.', {
        name: 'NotFoundError',
        details: {recordId: id, httpStatusCode: 404, public: true}
      });
    }
    return record;
  }
}

function _createStorageInitializer({collectionName} = {}) {
  bedrock.events.on('bedrock-mongodb.ready', async () => {
    await database.openCollections([collectionName]);

    await database.createIndexes([{
      // cover tokenized document queries by ID
      collection: collectionName,
      fields: {'tokenizedDocument.id': 1},
      options: {unique: true}
    }]);
  });
}

/**
 * An object containing information on the query plan.
 *
 * @typedef {object} ExplainObject
 */
