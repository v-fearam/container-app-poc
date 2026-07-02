#!/bin/sh
set -eu

API_URL_VALUE="${API_URL:-${VITE_API_URL:-}}"
APPINSIGHTS_VALUE="${APPINSIGHTS_CONNECTION_STRING:-${VITE_APPINSIGHTS_CONNECTION_STRING:-}}"

escape_for_js() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

API_URL_ESCAPED="$(escape_for_js "$API_URL_VALUE")"
APPINSIGHTS_ESCAPED="$(escape_for_js "$APPINSIGHTS_VALUE")"

cat > /usr/share/nginx/html/env-config.js <<EOF
window.__APP_CONFIG__ = {
  API_URL: "${API_URL_ESCAPED}",
  APPINSIGHTS_CONNECTION_STRING: "${APPINSIGHTS_ESCAPED}"
};
EOF
