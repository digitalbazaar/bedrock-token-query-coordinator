/*
 * Copyright (c) 2026 Digital Bazaar, Inc.
 */
import * as bedrock from '@bedrock/core';
import * as helpers from './helpers.js';

describe('mocked tokenizer tests', () => {
  describe('token clients', () => {
    let tokenUser1;
    let tokenUser2;
    let queryTypeUrl;
    let queryZcap;
    beforeEach(async () => {
      // create two token users
      tokenUser1 = await helpers.createMockTokenUser();
      tokenUser2 = await helpers.createMockTokenUser();

      // `tokenUser2` will respond to queries, so set HTTP API to use its
      // resolve zcap
      bedrock.config['token-query-coordinator'].servedQueries.tokenClient
        .zcaps.resolveToken = tokenUser2.zcaps.rootTokenRequester;

      // set query zcap based on `test.config.js` mock query types
      queryTypeUrl = bedrock.config.server.baseUri +
        '/query-types/test-mock-tokenizer';
      queryZcap = `urn:zcap:root:${encodeURIComponent(queryTypeUrl)}`;

      // create shared records
      {
        const fields = {
          testField1: 'a',
          testField2: 'b',
          testField3: 42
        };
        await tokenUser1.store({type: 'SharedType', fields});
        await tokenUser2.store({type: 'SharedType', fields});
      }

      // create unique record in token client 1
      {
        const fields = {
          testField1: 'unique-a',
          testField2: 'something',
          testField3: 43
        };
        await tokenUser1.store({
          type: 'SharedType', fields, localFields: {unique: true}
        });
      }

      // create non-shared records
      {
        const fields = {
          testField1: 'c',
          testField2: 'd'
        };
        await tokenUser1.store({type: 'NotSharedType', fields});
        await tokenUser2.store({type: 'NotSharedType', fields});
      }
    });

    it('client 1 gets authorized results from client 2', async () => {
      let attempts = 0;
      let passes = 0;
      for(const [pairwiseToken, {tokenizedDocument}] of tokenUser1.database) {
        if(tokenizedDocument.documentType === 'NotSharedType' ||
          tokenizedDocument.relatedFields.unique) {
          continue;
        }
        attempts++;
        const found = await tokenUser1.query({
          url: `${queryTypeUrl}/query`, pairwiseToken, queryZcap
        });
        if(found) {
          passes++;
        }
      }
      attempts.should.equal(1);
      passes.should.equal(1);
    });

    it('client 1 gets no authorized results from client 2', async () => {
      let attempts = 0;
      let passes = 0;
      let notFound = 0;
      for(const [pairwiseToken, {tokenizedDocument}] of tokenUser1.database) {
        if(!tokenizedDocument.relatedFields.unique) {
          continue;
        }
        attempts++;
        let found;
        try {
          await tokenUser1.query({
            url: `${queryTypeUrl}/query`, pairwiseToken, queryZcap
          });
          found = true;
        } catch(e) {
          if(e.status === 404) {
            notFound++;
          } else {
            throw e;
          }
        }
        if(found) {
          passes++;
        }
      }
      attempts.should.equal(1);
      passes.should.equal(0);
      notFound.should.equal(1);
    });

    it('client 1 gets no unauthorized results from client 2', async () => {
      let attempts = 0;
      let passes = 0;
      let notFound = 0;
      for(const [pairwiseToken, {tokenizedDocument}] of tokenUser1.database) {
        if(tokenizedDocument.documentType === 'SharedType') {
          continue;
        }
        attempts++;
        let found;
        try {
          await tokenUser1.query({
            url: `${queryTypeUrl}/query`, pairwiseToken, queryZcap
          });
          found = true;
        } catch(e) {
          if(e.status === 404) {
            notFound++;
          } else {
            throw e;
          }
        }
        if(found) {
          passes++;
        }
      }
      attempts.should.equal(1);
      passes.should.equal(0);
      notFound.should.equal(1);
    });
  });
});
