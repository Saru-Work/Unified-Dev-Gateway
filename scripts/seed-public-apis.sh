#!/usr/bin/env bash
# Registers public APIs in WSO2 API Manager, with their docs (endpoints,
# parameters, examples), and publishes them.
#
# Each API is an OpenAPI 3 file in scripts/public-apis/. Its info block gives
# the name, version and description, and "x-opengate" gives the gateway
# context, the real backend URL and tags. To add an API, add a file.
#
# Provider keys: if the upstream API needs a key, "x-opengate"."providerKey"
# says where it goes and which environment variable holds it:
#   "providerKey": { "in": "header" | "query", "name": "X-Api-Key",
#                    "env": "NASA_API_KEY", "fallback": "DEMO_KEY",
#                    "redact": ["api_key"] }
# The value is read from the environment or the repo's .env (never from the
# file), stored in WSO2 as endpoint security, and added by the gateway to
# every call to the provider, so developers never see or need it. "fallback"
# is only for a provider's public demo key. "redact" names query parameters
# whose values the gateway masks in responses, for providers that echo the
# key back (e.g. in links); it uses the policy in scripts/wso2-policies/.
#
# Safe to re-run: existing APIs (same name and version) get the current
# definition, description, tags and provider key, and are redeployed only if
# their endpoints or provider key changed.
#
# Usage: scripts/seed-public-apis.sh
# Env:   WSO2_URL (default https://localhost:9443)
#        WSO2_USERNAME / WSO2_PASSWORD (default admin / admin)
#        plus any provider key variables the API files name
# Needs: curl, jq, shasum or sha256sum
set -euo pipefail

WSO2_URL=${WSO2_URL:-https://localhost:9443}
WSO2_USERNAME=${WSO2_USERNAME:-admin}
WSO2_PASSWORD=${WSO2_PASSWORD:-admin}
PUBLISHER="$WSO2_URL/api/am/publisher/v4"
TIERS='["Bronze","Silver","Gold","Unlimited"]'
API_DIR="$(cd "$(dirname "$0")" && pwd)/public-apis"
ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env"
POLICY_DIR="$(cd "$(dirname "$0")" && pwd)/wso2-policies"
REDACT_POLICY=opengateRedactQueryParams

# Reads KEY=VALUE lines from .env as data (it's never executed). Variables
# already set in the environment win.
if [[ -f $ENV_FILE ]]; then
  while IFS= read -r line || [[ -n $line ]]; do
    [[ $line =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue
    key=${BASH_REMATCH[1]} value=${BASH_REMATCH[2]}
    value=${value%$'\r'}
    [[ $value =~ ^\"(.*)\"$ || $value =~ ^\'(.*)\'$ ]] && value=${BASH_REMATCH[1]}
    [[ -z ${!key+set} ]] && export "$key=$value"
  done <"$ENV_FILE"
fi

sha256() { if command -v sha256sum >/dev/null; then sha256sum; else shasum -a 256; fi | cut -c1-16; }

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
  --data-urlencode 'scope=apim:api_create apim:api_view apim:api_publish apim:api_manage apim:common_operation_policy_view apim:common_operation_policy_manage' |
  jq -r .access_token)
auth=(-H "Authorization: Bearer $token")

# The id of OpenGate's response-redaction policy, installing it on first use.
redact_policy_id() {
  if [[ -z ${REDACT_POLICY_ID:-} ]]; then
    REDACT_POLICY_ID=$(wso2 "${auth[@]}" "$PUBLISHER/operation-policies?limit=500" |
      jq -r --arg n "$REDACT_POLICY" '[.list[] | select(.name == $n and .version == "v1") | .id][0] // empty')
    if [[ -z $REDACT_POLICY_ID ]]; then
      REDACT_POLICY_ID=$(wso2 "${auth[@]}" "$PUBLISHER/operation-policies" \
        -F "policySpecFile=@$POLICY_DIR/$REDACT_POLICY.yaml" \
        -F "synapsePolicyDefinitionFile=@$POLICY_DIR/$REDACT_POLICY.j2" | jq -r .id)
      echo "  installed the $REDACT_POLICY policy in WSO2" >&2
    fi
  fi
  echo "$REDACT_POLICY_ID"
}

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

  # Provider key: endpoint security for WSO2, and properties that say it's
  # managed (shown to developers) plus a fingerprint to spot a changed key.
  # The key itself only travels through environment variables and stdin.
  local key_config security="null" properties="[]" fingerprint="" response_policies="[]"
  key_config=$(jq -c '.["x-opengate"].providerKey // empty' "$file")
  if [[ -n $key_config ]]; then
    local key_in key_name key_env
    key_in=$(jq -r .in <<<"$key_config")
    key_name=$(jq -r .name <<<"$key_config")
    key_env=$(jq -r .env <<<"$key_config")
    [[ $key_in == header || $key_in == query ]] || { echo "$file: providerKey.in must be header or query" >&2; exit 1; }
    export PROVIDER_KEY_VALUE=${!key_env:-$(jq -r '.fallback // empty' <<<"$key_config")}
    [[ -n $PROVIDER_KEY_VALUE ]] || { echo "$name needs a provider key: set $key_env in .env" >&2; exit 1; }
    [[ -z ${!key_env:-} ]] && echo "    note: $key_env isn't set; using the provider's public demo key"
    local redact
    redact=$(jq -r '(.redact // []) | join("|")' <<<"$key_config")
    [[ -z $redact || $redact =~ ^[A-Za-z0-9_-]+(\|[A-Za-z0-9_-]+)*$ ]] ||
      { echo "$file: providerKey.redact must be parameter names (letters, digits, _ and -)" >&2; exit 1; }
    if [[ -n $redact ]]; then
      response_policies=$(jq -nc --arg id "$(redact_policy_id)" --arg n "$REDACT_POLICY" --arg p "$redact" \
        '[{ policyName: $n, policyVersion: "v1", policyId: $id, parameters: { params: $p } }]')
    fi
    fingerprint=$(printf '%s|%s|%s|%s' "$key_in" "$key_name" "$PROVIDER_KEY_VALUE" "$redact" | sha256)
    security=$(jq -nc --arg name "$key_name" --arg type "$([[ $key_in == header ]] && echo HEADER || echo QUERY_PARAMETER)" '
      { enabled: true, type: "apikey", apiKeyIdentifier: $name, apiKeyIdentifierType: $type,
        apiKeyValue: $ENV.PROVIDER_KEY_VALUE } as $s | { production: $s, sandbox: $s }')
    properties=$(jq -nc --arg fp "$fingerprint" --arg in "$key_in" '[
      { name: "providerKey", value: "managed", display: true },
      { name: "providerKeyFingerprint", value: $fp, display: false } ]')
  fi

  local id
  id=$(wso2 "${auth[@]}" -G "$PUBLISHER/apis" --data-urlencode "query=name:\"$name\"" |
    jq -r --arg name "$name" --arg version "$version" \
      '.list[] | select(.name == $name and .version == $version) | .id' | head -n1)

  local before="" key_changed=""
  if [[ -z $id ]]; then
    local operations body
    operations=$(jq '[.paths | to_entries[] | .key as $p | .value | to_entries[]
      | select(.key | test("^(get|post|put|patch|delete|head|options)$"))
      | { target: $p, verb: (.key | ascii_upcase),
          authType: "Application & Application User", throttlingPolicy: "Unlimited" }]' <<<"$definition")
    body=$(jq -n \
      --arg name "$name" --arg context "$context" --arg version "$version" \
      --arg backend "$backend" --arg description "$description" \
      --argjson tags "$tags" --argjson operations "$operations" --argjson tiers "$TIERS" \
      --argjson properties "$properties" --argjson response_policies "$response_policies" '{
        name: $name, context: $context, version: $version, description: $description,
        tags: $tags, policies: $tiers, operations: $operations,
        visibility: "PUBLIC", transport: ["http", "https"],
        additionalProperties: $properties,
        apiPolicies: { request: [], response: $response_policies, fault: [] },
        endpointConfig: {
          endpoint_type: "http",
          production_endpoints: { url: $backend },
          sandbox_endpoints: { url: $backend }
        }
      }' | jq --argjson security "$security" \
        'if $security then .endpointConfig.endpoint_security = $security else . end')
    # stdin, not an argument: the body may hold the provider key.
    id=$(wso2 "${auth[@]}" -H 'Content-Type: application/json' "$PUBLISHER/apis" -d @- <<<"$body" | jq -r .id)
    echo "  created $name $version ($id)"
  else
    echo "  updating $name $version ($id)"
    before=$(wso2 "${auth[@]}" "$PUBLISHER/apis/$id/swagger" | resources)

    # Keep the description, tags and provider key in step with the file.
    local api current_fp
    api=$(wso2 "${auth[@]}" "$PUBLISHER/apis/$id")
    current_fp=$(jq -r '[.additionalProperties[]? | select(.name == "providerKeyFingerprint") | .value][0] // ""' <<<"$api")
    [[ $current_fp != "$fingerprint" ]] && key_changed=1
    if [[ $(jq -r '.description // ""' <<<"$api") != "$description" ||
          $(jq -c '.tags | sort' <<<"$api") != "$(jq -c 'sort' <<<"$tags")" ||
          -n ${key_changed:-} ]]; then
      # WSO2 never returns a stored key, so a keyed API's PUT must always carry
      # it again, or the update would wipe it.
      jq --arg d "$description" --argjson t "$tags" --argjson security "$security" \
        --argjson properties "$properties" --argjson response_policies "$response_policies" \
        --arg rp "$REDACT_POLICY" '
        .description = $d | .tags = $t
        | .additionalProperties = ([.additionalProperties[]? | select(.name | startswith("providerKey") | not)] + $properties)
        | .apiPolicies.response = ([.apiPolicies.response[]? | select(.policyName != $rp)] + $response_policies)
        | if $security then .endpointConfig.endpoint_security = $security
          else del(.endpointConfig.endpoint_security) end' <<<"$api" |
        wso2 "${auth[@]}" -X PUT -H 'Content-Type: application/json' "$PUBLISHER/apis/$id" -d @- >/dev/null
      if [[ -n ${key_changed:-} ]]; then
        echo "    updated provider key"
      else
        echo "    updated description and tags"
      fi
    fi
  fi

  # The docs: summaries, parameters, request bodies and examples.
  wso2 "${auth[@]}" -X PUT "$PUBLISHER/apis/$id/swagger" \
    --form-string "apiDefinition=$definition" >/dev/null
  echo "    uploaded definition ($(resources <<<"$definition" | wc -l | tr -d ' ') endpoints)"

  # The gateway serves a deployed revision: deploy one if there's none yet, or
  # if the endpoints or provider key changed. Docs-only changes don't need it.
  local deployed
  deployed=$(wso2 "${auth[@]}" "$PUBLISHER/apis/$id/deployments" | jq 'length')
  if [[ $deployed == 0 || -n $key_changed || $before != "$(resources <<<"$definition")" ]]; then
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

  unset PROVIDER_KEY_VALUE

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
