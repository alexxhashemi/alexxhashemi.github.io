#!/bin/bash
# Double-click this file to preview the site.
# Starts a local server and opens your browser automatically.
# Close the Terminal window (or press Ctrl+C) to stop it.

cd "$(dirname "$0")" || exit 1

PORT=8000

# if the port is busy, walk up until we find a free one
while lsof -i :$PORT >/dev/null 2>&1; do
  PORT=$((PORT + 1))
done

echo ""
echo "  Alex Hashemi | local preview"
echo "  ----------------------------"
echo "  Serving:  http://localhost:$PORT"
echo "  Folder:   $(pwd)"
echo ""
echo "  Press Ctrl+C to stop."
echo ""

python3 run.py
