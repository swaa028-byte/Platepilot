#!/usr/bin/env bash
# Create the Netlify site in a team, load its configuration and deploy.
#
#   NETLIFY_ACCOUNT=marcusk-ai ./scripts/launch-netlify.sh
#
# Needs: a Netlify login that can write to that team, and .env.local in the
# repository root holding the hosted database values (it is gitignored, so it
# never ships). Values are read from that file and never printed.
#
# Linking the GitHub repository is deliberately not attempted here: Netlify
# attaches a repository through GitHub's own authorisation flow, and an API call
# without that handshake is accepted and then silently ignored.
set -euo pipefail

: "${NETLIFY_ACCOUNT:?Set NETLIFY_ACCOUNT to the team slug, for example marcusk-ai}"
SITE_NAME="${SITE_NAME:-platepilot}"
ENV_FILE="${ENV_FILE:-.env.local}"
BRANCH="${BRANCH:-feature/platepilot-core}"

[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE: it holds the database values." >&2; exit 1; }

read_env() {
  # Reads one value without publishing it to the terminal or a process listing.
  sed -n "s/^$1=//p" "$ENV_FILE" | head -1
}

for key in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY; do
  [ -n "$(read_env "$key")" ] || { echo "$key is empty in $ENV_FILE" >&2; exit 1; }
done

echo "Creating the site in $NETLIFY_ACCOUNT"
SITE_ID=$(npx -y netlify-cli@latest sites:create --name "$SITE_NAME" --account-slug "$NETLIFY_ACCOUNT" --json \
  | node -e 'let raw="";process.stdin.on("data",d=>raw+=d).on("end",()=>{const i=raw.indexOf("{");console.log(JSON.parse(raw.slice(i)).site_id)})')
echo "Site: $SITE_ID"

for key in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY; do
  npx -y netlify-cli@latest env:set "$key" "$(read_env "$key")" --site "$SITE_ID" --context all --force >/dev/null
  echo "  $key set"
done

URL=$(npx -y netlify-cli@latest api getSite -d "{\"site_id\":\"$SITE_ID\"}" \
  | node -e 'let raw="";process.stdin.on("data",d=>raw+=d).on("end",()=>{const i=raw.indexOf("{");const s=JSON.parse(raw.slice(i));console.log(s.ssl_url)})')
npx -y netlify-cli@latest env:set APP_URL "$URL" --site "$SITE_ID" --context all --force >/dev/null
echo "  APP_URL set to $URL"

npx -y netlify-cli@latest link --id "$SITE_ID" >/dev/null

echo
echo "Next, in the browser:"
echo "  1. app.netlify.com/projects/$(basename "$URL" .netlify.app) -> Site configuration -> Build & deploy"
echo "  2. Link repository -> GitHub -> MarcusK-ai/rea-cloudwaitress -> branch $BRANCH"
echo "     (settings come from netlify.toml; nothing to type)"
echo
echo "Then verify: curl -s $URL/api/ready   # expect status ready, database supabase"
