# Bedrock Token Query Coordinator Testing

## Testing against a mock tokenizer system

By default, the tests run against a built-in mock tokenizer system. Running:

```
npm t
```

Will execute against this mock system.

## Testing against a development tokenizer system

To test against a development tokenizer system that is configured to allow
the default dev bedrock app identity to create meters for the creation of
token-requester instances, instead:

1. Install and start the development tokenizer system.
2. Run the tests with `DEV_TOKENIZER_URL=<base URL to dev tokenizer>`.

Replacing the URL value as necessary. Example steps:

```
cd tests
npm i
DEV_TOKENIZER_URL=https://localhost:47751 npm t
```
