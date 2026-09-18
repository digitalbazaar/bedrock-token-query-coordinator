# Bedrock Token Query Coordinator _(@bedrock/token-query-coordinator)_

[![Build Status](https://img.shields.io/github/actions/workflow/status/digitalbazaar/bedrock-token-query-coordinator/main.yaml)](https://github.com/digitalbazaar/bedrock-token-query-coordinator/actions/workflows/main.yaml)
[![NPM Version](https://img.shields.io/npm/v/@bedrock/token-query-coordinator.svg)](https://npm.im/@bedrock/token-query-coordinator)

> Core functionality for Bedrock Token Query Coordinators.

## Table of Contents

- [Background](#background)
- [Security](#security)
- [Install](#install)
- [Usage](#usage)
  - [TokenClient](#tokenclient)
  - [Configuration](#configuration)
  - [HTTP API](#http-api)
- [Contribute](#contribute)
- [Commercial Support](#commercial-support)
- [License](#license)

## Background

This module provides the core functionality for a **token query coordinator**:
a service that lets two organizations discover that they hold records about the
same entity, without either one disclosing the record.

One problem it solves is matching without disclosure. Two parties each hold
identity records. Both tokenize their records against the same tokenizer
service, which converts identity fields into cryptographic tokens. Identical
input produces a matching token, so each side can ask the other a narrow
question about a token rather than exchanging other information, such as PII
like names, birth dates, or government identifiers.

Three terms matter:

- **Pairwise token** — the result of tokenizing one document, stable for a
  given document and requester. That stability is what makes matching work.
- **Query token** — a single-use token derived from a pairwise token. A
  pairwise token is never sent to another party; it is exchanged at the
  tokenizer's `/connect` endpoint for a query token, which the other party
  resolves back to *its own* pairwise token for the same record.
- **Query type** — a named, capability-authorized question a coordinator is
  willing to answer, and the specific fields it returns.

A coordinator can act as a query **requester**, a query **responder**, or both.
Responding is off by default; see `servedQueries` under
[Configuration](#configuration).

Note that a token query coordinator is unrelated to a **VC issuer
coordinator**, despite the shared word. "Coordinator" describes the shape — a
service owning a multi-step workflow over a single-purpose primitive — not the
subject. This module coordinates tokenized record matching; it does not issue
or verify credentials.

### How a query runs

1. **Tokenize.** Each side hashes a document locally and sends only the digest
   to the tokenizer, receiving a pairwise token. A requester typically stores
   that token with a local correlation identifier.
2. **Connect.** To ask about one record, the requester exchanges its pairwise
   token for a single-use query token.
3. **Query.** The requester sends the query token to the responder's query
   endpoint. The responder resolves it to its own pairwise token, looks up the
   matching document, and returns only the fields its query type permits.
4. **Result.** A responder holding no matching record returns a 404, which a
   requester normally records as "not found" rather than as an error.

No identity record moves between the two organizations at any step.

## Security

**Documents are hashed before they leave the caller.** `tokenize()` computes a
digest locally and transmits only that digest. The tokenizer never receives the
document.

**Every call is capability-authorized.** Tokenizing, connecting, resolving, and
querying each require a zcap. There is no ambient authority: a caller can
perform exactly the operations its capabilities name, against exactly the
invocation targets they specify. Capability invocation targets must be HTTPS
URLs; `TokenClient` rejects anything else.

**Query tokens are single use.** Once one token client resolves a query token
to a pairwise token, no other client can resolve it. This is what keeps the two
sides' token spaces from being correlated by a third party that observes a
token in transit.

**Responders disclose only what a query type names.** A query type's
`returnFilter.relatedFields` is an allowlist. A responder returns those fields
and nothing else, and the list may be empty — a bare match confirmation.

**Responding is disabled by default.** `servedQueries.enabled` is `false`, and
no query routes are registered when it is. Enabling it is a deliberate choice
to answer other parties' questions.

Delegation is bounded by `authorizeZcapInvocationOptions`: chains are limited
to `maxChainLength`, delegations to `maxDelegationTtl`, and clock skew to
`maxClockSkew`. Review these before deploying.

## Install

This software requires and supports maintained recent versions of Node.js.
Updates may remove support for older unmaintained platform versions. Please use
dependency version lock files and testing to ensure compatibility with this
software.

### NPM

To install via NPM:

```
npm install --save @bedrock/token-query-coordinator
```

### Development

To install locally (for development):

```
git clone https://github.com/digitalbazaar/bedrock-token-query-coordinator.git
cd bedrock-token-query-coordinator
npm install
```

## Usage

Import the module for its side effects — it registers configuration and, when
responding is enabled, HTTP routes — and use `TokenClient` for calls.

```js
import {TokenClient, tokenizedDocuments} from '@bedrock/token-query-coordinator';
```

### TokenClient

Construct a client with a zcap client and, to use `upsert()`, a storage object.

```js
const tokenClient = new TokenClient({
  zcapClient, storage: tokenizedDocuments.storage
});
```

| Method | Purpose |
| --- | --- |
| `tokenize({document, tokenizeZcap})` | Hashes `document` locally and tokenizes the digest. Resolves to `{pairwiseToken}`. |
| `upsert({document, relatedFields, tokenizeZcap})` | Tokenizes, then inserts or updates the tokenized document in storage. Resolves to `{pairwiseToken}`. |
| `connect({pairwiseToken, connectZcap})` | Exchanges a pairwise token for a single-use `{queryToken}`. |
| `resolve({queryToken, resolveZcap})` | Resolves a query token received from another client to `{pairwiseToken}`. |
| `query({pairwiseToken, connectZcap, queryZcap, url})` | Connects and queries in one call. Resolves to `{results}`, optionally with `hasMore` and `cursor`. |

`document` must carry a `type` field, which is stored alongside the tokenized
document and matched against a query type's `documentType`. `relatedFields` are
stored with the document; on a repeat `upsert()` they are merged, adding new
keys and overwriting matching ones while leaving others alone.

Use `query()` for the common path. `connect()` and `resolve()` are the
underlying steps, exposed for coordinators that manage the exchange themselves.

### Configuration

Configuration lives under `bedrock.config['token-query-coordinator']`.

```js
import {config} from '@bedrock/core';
const cfg = config['token-query-coordinator'];
```

| Setting | Default | Purpose |
| --- | --- | --- |
| `cacheDefaults` | `{max: 1000, ttl: 300000}` | Config cache size and TTL in milliseconds. |
| `authorizeZcapInvocationOptions` | chain 10, skew 300s, TTL 1 year | Bounds on accepted zcap invocations. |
| `authorization.oauth2` | skew 300s | OAuth2 settings, where a service object enables it. |
| `servedQueries.enabled` | `false` | Whether this coordinator answers queries. No routes are registered while it is `false`. |
| `servedQueries.tokenClient.zcaps.resolveToken` | `null` | The zcap used to resolve incoming query tokens. Required when responding. |
| `servedQueries.queryTypes` | — | The queries this coordinator answers. |

A requester needs no `servedQueries` configuration. Leave `enabled` at `false`
and supply zcaps to `TokenClient` directly.

To respond, enable it and define at least one query type:

```js
cfg.servedQueries.enabled = true;
cfg.servedQueries.tokenClient.zcaps.resolveToken = resolveZcap;
cfg.servedQueries.queryTypes = {
  'postal-code': {
    // only documents of this type match
    documentType: 'IdentityRecordSPII',
    returnFilter: {
      // the only fields disclosed on a match; may be empty
      relatedFields: ['postalCode']
    }
  }
};
```

`returnFilter.relatedFields` is an allowlist. Keep it as narrow as the question
requires.

### HTTP API

Routes are registered only when `servedQueries.enabled` is `true`, under the
`query-type` service type:

```
POST /query-types/:localId/query
```

The request body carries a query token. On a match the response is:

```json
{
  "results": [{"documentType": "...", "relatedFields": {"...": "..."}}],
  "hasMore": false
}
```

A document matches only when its `documentType` equals the query type's, and
`relatedFields` contains only the fields the query type allows. When nothing
matches, the endpoint returns a 404. Requesters normally reach this endpoint
through `TokenClient.query()` rather than directly.

### Requirements

This module is a Bedrock module and expects the peer dependencies listed in
`package.json`, including `@bedrock/mongodb` for storage and
`@bedrock/app-identity` for the application identity that signs zcap
invocations. It also requires a reachable tokenizer service.

## Contribute

See [the contributing file](https://github.com/digitalbazaar/bedrock/blob/master/CONTRIBUTING.md).

PRs accepted.

If editing README.md, please conform to the
[standard-readme](https://github.com/RichardLitt/standard-readme) specification.

## Commercial Support

Commercial support for this library is available upon request from
Digital Bazaar: support@digitalbazaar.com

## License

[Bedrock Non-Commercial License v1.0](LICENSE.md) © Digital Bazaar
