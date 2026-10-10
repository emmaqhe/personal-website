#!/bin/bash
# Double-click on a Mac to open the studio. Close this window to stop.
cd "$(dirname "$0")"
PORT=8642
URL="http://localhost:$PORT/editor.html"
if ! command -v python3 >/dev/null 2>&1; then
  echo "This needs Python 3. Install it from https://www.python.org/downloads/ and try again."
  read -r -p "Press Enter to close."
  exit 1
fi
echo "Studio running at $URL"
echo "Your site preview: http://localhost:$PORT/"
echo "Close this window to stop."
(sleep 1 && open "$URL") &
python3 -m http.server "$PORT" --bind 127.0.0.1
