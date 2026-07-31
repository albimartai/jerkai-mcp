---
name: Bug report
about: Something behaves differently from the spec or from reasonable expectation.
title: ""
labels: bug
---

## What happened

<!-- Observed behavior, with the exact JSON-RPC response or stderr output where relevant. -->

## Expected

<!-- What should have happened; cite the PRD AC or convention it violates if applicable. -->

## Repro steps

1.
2.

## Environment

<!-- Which MCP client (name and version), or "none — reproduced through the smoke script".
     The server version from package.json, and the commit it was built from.
     Does it reproduce through `npm run build && npm run smoke`, or only through a real
     client? A bug that only appears through a client is the class CI cannot reach — say so. -->

## Data notes

<!-- This repo holds no biometric data, so there is nothing real to leak from a reading.
     A report can still leak product surface: paste the tool output you actually observed
     rather than anything from a live JerkAI dataset, and describe the shape of a wrong
     metric key set or caveat string rather than reproducing a full one. -->
