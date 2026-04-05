#!/bin/sh

echo "safe"

# ok: hygiene.no-suppression-comments-hash
echo "still safe"

# ruleid: hygiene.no-suppression-comments-hash
# nosemgrep
echo "blocked"

# ruleid: hygiene.no-suppression-comments-hash
# semgrep:ignore
echo "blocked again"
