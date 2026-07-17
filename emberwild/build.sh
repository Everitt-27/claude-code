#!/usr/bin/env bash
# Assembles Emberwild from parts/ into:
#   game.html  — artifact-ready page content (no doctype/head/body wrapper)
#   index.html — standalone page for direct browser / iOS home-screen use
set -euo pipefail
cd "$(dirname "$0")"

TMPJS="${EW_TMP:-/tmp}/emberwild_all.js"

# concatenated pure-JS image for syntax checking
{ tail -n +2 parts/10_core.js
  cat parts/20_world.js parts/30_ents.js parts/35_draw.js parts/40_ui.js
} > "$TMPJS"
node --check "$TMPJS"

cat parts/00_head.html parts/10_core.js parts/20_world.js \
    parts/30_ents.js parts/35_draw.js parts/40_ui.js > game.html
printf '</script>\n' >> game.html

{
cat <<'HEAD'
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#0c0b0a">
<title>Emberwild</title>
<style>html,body{margin:0;padding:0;background:#0c0b0a;height:100%;overflow:hidden}</style>
</head>
<body>
HEAD
cat game.html
printf '</body>\n</html>\n'
} > index.html

echo "built: game.html ($(wc -c < game.html) bytes), index.html ($(wc -c < index.html) bytes)"
