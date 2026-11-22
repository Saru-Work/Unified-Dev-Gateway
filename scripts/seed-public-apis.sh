#!/usr/bin/env bash
# Registers free, no-key public APIs in WSO2 API Manager, with their docs
# (endpoints, parameters, examples), and publishes them.
#
# Each API is an OpenAPI 3 file in scripts/public-apis/. Its info block gives
# the name, version and description, and "x-opengate" gives the gateway
# context, the real backend URL and tags. To add an API, add a file.
#
# Safe to re-run: existing APIs (same name and version) get the current
# definition, description and tags, and are redeployed only if their
# endpoints changed.
#
# Usage: scripts/seed-public-apis.sh
# Env:   WSO2_URL (default https://localhost:9443)
#        WSO2_USERNAME / WSO2_PASSWORD (default admin / admin)
# Needs: curl, jq
set -euo pipefail

WSO2_URL=${WSO2_URL:-https://localhost:9443}
WSO2_USERNAME=${WSO2_USERNAME:-admin}
WSO2_PASSWORD=${WSO2_PASSWORD:-admin}
PUBLISHER="$WSO2_URL/api/am/publisher/v4"
TIERS='["Bronze","Silver","Gold","Unlimited"]'
API_DIR="$(cd "$(dirname "$0")" && pwd)/public-apis"

for tool in curl jq; do
  command -v "$tool" >/dev/null || { echo "Needs $tool" >&2; exit 1; }
done

# WSO2 ships with a self-signed certificate, hence -k.
wso2() { curl -sSk --fail-with-body "$@"; }

echo "Getting a Publisher token from $WSO2_URL as $WSO2_USERNAME…"
client=$(wso2 -u "$WSO2_USERNAME:$WSO2_PASSWORD" -H 'Content-Type: application/json' \
  "$WSO2_URL/client-registration/v0.17/register" \
  -d "$(jq -n --arg owner "$WSO2_USERNAME" '{
        callbackUrl: "www.example.com", clientName: "opengate_seed", owner: $owner,
        grantType: "password refresh_token", saasApp: true }')")
token=$(wso2 -u "$(jq -r .clientId <<<"$client"):$(jq -r .clientSecret <<<"$client")" \
  "$WSO2_URL/oauth2/token" \
  --data-urlencode grant_type=password \
  --data-urlencode "username=$WSO2_USERNAME" \
  --data-urlencode "password=$WSO2_PASSWORD" \
  --data-urlencode 'scope=apim:api_create apim:api_view apim:api_publish apim:api_manage' |
  jq -r .access_token)
auth=(-H "Authorization: Bearer $token")

# "VERB /path" lines for an OpenAPI document, sorted; what the gateway routes on.
resources() {
  jq -r '.paths | to_entries[] | .key as $p | .value | keys[]
         | select(test("^(get|post|put|patch|delete|head|options)$"))
         | "\(ascii_upcase) \($p)"' | sort
}

seed() {
  local file=$1
  local name version context backend description tags definition
  name=$(jq -r .info.title "$file")
  version=$(jq -r .info.version "$file")
  description=$(jq -r '.info.description // ""' "$file")
  context=$(jq -r '.["x-opengate"].context' "$file")
  backend=$(jq -r '.["x-opengate"].backend' "$file")
  tags=$(jq -c '.["x-opengate"].tags // []' "$file")
  # x-opengate and x-test-value are for these scripts, not for WSO2 or readers.
  definition=$(jq 'del(.["x-opengate"]) | walk(if type == "object" then del(.["x-test-value"]) else . end)' "$file")

  local id
  id=$(wso2 "${auth[@]}" -G "$PUBLISHER/apis" --data-urlencode "query=name:\"$name\"" |
    jq -r --arg name "$name" --arg version "$version" \
      '.list[] | select(.name == $name and .version == $version) | .id' | head -n1)

  local before=""
  if [[ -z $id ]]; then
    local operations body
    operations=$(jq '[.paths | to_entries[] | .key as $p | .value | to_entries[]
      | select(.key | test("^(get|post|put|patch|delete|head|options)$"))
      | { target: $p, verb: (.key | ascii_upcase),
          authType: "Application & Application User", throttlingPolicy: "Unlimited" }]' <<<"$definition")
    body=$(jq -n \
      --arg name "$name" --arg context "$context" --arg version "$version" \
      --arg backend "$backend" --arg description "$description" \
      --argjson tags "$tags" --argjson operations "$operations" --argjson tiers "$TIERS" '{
        name: $name, context: $context, version: $version, description: $description,
        tags: $tags, policies: $tiers, operations: $operations,
        visibility: "PUBLIC", transport: ["http", "https"],
        endpointConfig: {
          endpoint_type: "http",
          production_endpoints: { url: $backend },
          sandbox_endpoints: { url: $backend }
        }
      }')
    id=$(wso2 "${auth[@]}" -H 'Content-Type: application/json' "$PUBLISHER/apis" -d "$body" | jq -r .id)
    echo "  created $name $version ($id)"
  else
    echo "  updating $name $version ($id)"
    before=$(wso2 "${auth[@]}" "$PUBLISHER/apis/$id/swagger" | resources)

    # Keep the description and tags in step with the file.
    local api
    api=$(wso2 "${auth[@]}" "$PUBLISHER/apis/$id")
    if [[ $(jq -r '.description // ""' <<<"$api") != "$description" ||
          $(jq -c '.tags | sort' <<<"$api") != "$(jq -c 'sort' <<<"$tags")" ]]; then
      wso2 "${auth[@]}" -X PUT -H 'Content-Type: application/json' "$PUBLISHER/apis/$id" \
        -d "$(jq --arg d "$description" --argjson t "$tags" '.description = $d | .tags = $t' <<<"$api")" \
        >/dev/null
      echo "    updated description and tags"
    fi
  fi

  # The docs: summaries, parameters, request bodies and examples.
  wso2 "${auth[@]}" -X PUT "$PUBLISHER/apis/$id/swagger" \
    --form-string "apiDefinition=$definition" >/dev/null
  echo "    uploaded definition ($(resources <<<"$definition" | wc -l | tr -d ' ') endpoints)"

  # The gateway serves a deployed revision: deploy one if there's none yet or
  # if the endpoints changed. Docs-only changes don't need it.
  local deployed
  deployed=$(wso2 "${auth[@]}" "$PUBLISHER/apis/$id/deployments" | jq 'length')
  if [[ $deployed == 0 || $before != "$(resources <<<"$definition")" ]]; then
    # WSO2 keeps at most 5 revisions; drop the ones that aren't deployed.
    for old in $(wso2 "${auth[@]}" "$PUBLISHER/apis/$id/revisions?query=deployed:false" | jq -r '.list[].id'); do
      wso2 "${auth[@]}" -X DELETE "$PUBLISHER/apis/$id/revisions/$old" >/dev/null
    done
    local revision
    revision=$(wso2 "${auth[@]}" -H 'Content-Type: application/json' \
      "$PUBLISHER/apis/$id/revisions" -d '{"description":"Seeded by OpenGate"}' | jq -r .id)
    wso2 "${auth[@]}" -H 'Content-Type: application/json' \
      "$PUBLISHER/apis/$id/deploy-revision?revisionId=$revision" \
      -d '[{"name":"Default","vhost":"localhost","displayOnDevportal":true}]' >/dev/null
    echo "    deployed revision $revision to the Default gateway"
  fi

  local state
  state=$(wso2 "${auth[@]}" "$PUBLISHER/apis/$id" | jq -r .lifeCycleStatus)
  if [[ $state != PUBLISHED ]]; then
    wso2 "${auth[@]}" -X POST "$PUBLISHER/apis/change-lifecycle?apiId=$id&action=Publish" >/dev/null
    echo "    published"
  fi
}

echo "Registering APIs from $API_DIR…"
shopt -s nullglob
files=("$API_DIR"/*.json)
[[ ${#files[@]} -gt 0 ]] || { echo "No API definitions in $API_DIR" >&2; exit 1; }
for file in "${files[@]}"; do
  seed "$file"
done

echo "Done. Gateway URLs: https://localhost:8243/<context>/1.0.0/… (http on :8280)."
echo "New APIs take about 15 seconds to load on the gateway; it answers 404 until then."
