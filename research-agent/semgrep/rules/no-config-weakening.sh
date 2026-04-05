#!/bin/sh

# ok: config.no-hook-bypass
bun run test

# ruleid: config.no-hook-bypass
bun run test || true

# ruleid: config.no-weakened-biome-any
"noExplicitAny": "off"

# ruleid: config.no-weakened-biome-non-null
"noNonNullAssertion": "off"

# ruleid: config.no-weakened-check-script
"typecheck": "true"

# ruleid: config.no-weakened-check-script
"lint:semgrep": "echo skipped"
