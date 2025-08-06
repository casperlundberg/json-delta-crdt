# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DSON is a prototype implementation of delta-based CRDTs (Conflict-free Replicated Data Types) supporting JSON data structures. This is a research prototype for demonstrating delta-based CRDT concepts from an academic paper.

## Commands

### Install Dependencies
```bash
npm install
```

### Run Tests
```bash
# Run all tests
npm test

# Run a single test file
node node_modules/mocha/bin/mocha test/frontend/public-api.spec.js

# Run a specific benchmark test
node node_modules/mocha/bin/mocha benchmarks/map_updates.js
```

### Run Paper Figure Generation
```bash
# Generate specific figures from the paper (3a-3f, 4, or 5)
python run_test.py -fig 3a
python run_test.py -fig 4
python run_test.py -fig 5
```

### Linting
```bash
npm run lint
```

## Architecture

The codebase implements delta-based CRDTs with a two-layer architecture:

### Backend Layer (`src/backend/`)
- **Core CRDT implementations**: `crdts.js` contains ORMap, ORArray, and MVReg implementations
- **Dot stores**: `dotstores.js` implements DotMap, DotFunMap, and DotFun for managing CRDT state
- **Causal context**: `causal-context.js` tracks version vectors for conflict resolution
- **JSON objects**: `JsonObjects/` contains JsonArray, JsonMap, and JsonRegister wrappers

### Frontend Layer (`src/frontend/`)
- **Public API**: `index.js` exposes init(), change(), applyChanges(), getChanges() functions
- **Proxy system**: `proxies.js` provides transparent JavaScript object interface to CRDTs
- **Delta encoding**: `encoder.js` handles serialization of delta changes
- **Delta modes**: Supports COMPRESSED_DELTAS and UNCOMPRESSED_DELTAS caching strategies

### Key Concepts
- **Deltas**: Changes are represented as delta mutations that can be compressed or stored separately
- **Replica IDs**: Each replica has a unique ID for tracking causality
- **Join operations**: DotMap.join() merges states and deltas using CRDT semantics

## Testing
- Tests use Mocha with Chai assertions
- Backend tests focus on CRDT correctness
- Frontend tests verify public API behavior and nesting
- Benchmarks compare performance against Automerge and Yjs libraries