#!/bin/bash
# Double-click this file to publish the site: it commits everything and pushes to GitHub.

cd "$(dirname "$0")" || exit 1
rm -f .git/index.lock

echo ""
echo "  Alex Hashemi | publish"
echo "  ----------------------"

git add -A
if git diff --cached --quiet; then
  echo "  Nothing new to publish."
else
  git commit -m "Update website $(date '+%Y-%m-%d %H:%M')" >/dev/null && echo "  Committed your changes."
fi

git pull --rebase -q origin "$(git branch --show-current)" 2>/dev/null
if git push -u origin "$(git branch --show-current)"; then
  echo ""
  echo "  Published. GitHub Pages updates in a minute or two."
else
  echo ""
  echo "  Push failed. Copy the message above and send it to Claude."
fi
echo ""
read -n 1 -s -r -p "  Press any key to close."
