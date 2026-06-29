/*!
 * Copyright (c) 2026 Digital Bazaar, Inc.
 */
import {loggers} from '@bedrock/core';
import {namespace} from './config.js';

export const logger = loggers.get('app').child(namespace);
