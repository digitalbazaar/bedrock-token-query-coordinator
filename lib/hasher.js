/*!
 * Copyright (c) 2026 Digital Bazaar, Inc.
 */
import canonicalize from 'canonicalize';
import {createHash} from 'node:crypto';

export function hashDocument({document} = {}) {
  // digest JCS-canonicalized document
  const digest = createHash('sha256').update(canonicalize(document)).digest();
  // multibase-multihash encode digest
  // 0x12 means sha2-256
  // 32 is the digest length in bytes
  // `u` means `base64url`
  const mh = Buffer.concat([Buffer.from([0x12, 32]), digest]);
  return `u${mh.toString('base64url')}`;
}
