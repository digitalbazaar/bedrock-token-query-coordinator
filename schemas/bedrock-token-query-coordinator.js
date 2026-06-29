/*!
 * Copyright (c) 2026 Digital Bazaar, Inc.
 */
const controller = {
  title: 'controller',
  type: 'string',
  maxLength: 4096
};

const id = {
  title: 'id',
  type: 'string',
  maxLength: 4096
};

export const delegatedZcap = {
  title: 'Delegated ZCAP',
  type: 'object',
  additionalProperties: false,
  required: [
    '@context', 'controller', 'expires', 'id', 'invocationTarget',
    'parentCapability', 'proof'
  ],
  properties: {
    controller,
    id,
    allowedAction: {
      anyOf: [{
        type: 'string'
      }, {
        type: 'array',
        minItems: 1,
        items: {type: 'string'}
      }]
    },
    expires: {
      // FIXME: w3c datetime
      title: 'expires',
      type: 'string'
    },
    '@context': {
      title: '@context',
      anyOf: [{
        type: 'string'
      }, {
        type: 'array',
        minItems: 1,
        items: {type: 'string'}
      }]
    },
    invocationTarget: {
      title: 'Invocation Target',
      type: 'string'
    },
    parentCapability: {
      title: 'Parent Capability',
      type: 'string'
    },
    proof: {
      title: 'Proof',
      type: 'object',
      additionalProperties: false,
      required: [
        'verificationMethod', 'type', 'created', 'proofPurpose',
        'capabilityChain', 'proofValue'
      ],
      properties: {
        verificationMethod: {
          title: 'verificationMethod',
          type: 'string'
        },
        type: {
          title: 'type',
          type: 'string'
        },
        created: {
          title: 'created',
          type: 'string'
        },
        proofPurpose: {
          title: 'proofPurpose',
          type: 'string'
        },
        capabilityChain: {
          title: 'capabilityChain',
          type: 'array',
          minItems: 1,
          items: {
            type: ['string', 'object']
          }
        },
        proofValue: {
          title: 'proofValue',
          type: 'string'
        }
      }
    }
  }
};
export const postRevocationBody = {...delegatedZcap};

export const performQueryBody = {
  title: 'Tokenized Query',
  type: 'object',
  additionalProperties: false,
  required: ['queryToken'],
  properties: {
    queryToken: {
      type: 'string'
    }
  }
};
