#!/bin/sh
# Starts WSO2 API Manager with OpenGate's settings, then hands over to the
# image's own entrypoint. Mounted by docker-compose.yml. Idempotent.
set -e
home=/home/wso2carbon/wso2am-4.7.0
conf=$home/repository/conf/deployment.toml

# 1. Analytics: WSO2's "elk" mode makes the gateway write one JSON event per
#    API call to repository/logs/apim_metrics.log (log4j2 already routes it
#    there). OpenGate's backend reads that file for per-application usage.
sed -i '/^\[apim\.analytics\]/,/^\[/{
  s/^enable = false/enable = true/
  s/^type = "moesif"/type = "elk"/
}' "$conf"

# 2. Search index: WSO2 lists APIs from a Solr index under solr/, but records
#    "indexed up to" in its database. If the index is empty (first start, or
#    its volume was lost) while the database survived, nothing would be
#    re-indexed and every API list would come back empty. A new re_indexing
#    number makes WSO2 rebuild the whole index; the number is kept with the
#    index so a normal restart doesn't rebuild it again.
solr=$home/solr
marker=$solr/.opengate-reindex
if [ -z "$(ls -A "$solr/data" 2>/dev/null)" ] || [ ! -f "$marker" ]; then
  date +%s >"$marker"
  echo "OpenGate: search index is empty; WSO2 will rebuild it"
fi
sed -i '/^# opengate-indexing-start$/,/^# opengate-indexing-end$/d' "$conf"
printf '# opengate-indexing-start\n[indexing]\nre_indexing = %s\n# opengate-indexing-end\n' "$(cat "$marker")" >>"$conf"

# 3. Encryption key: WSO2 encrypts secrets (such as provider keys) with the
#    [encryption] key, and api-manager.sh generates a random one whenever it's
#    missing, i.e. in every new container. Data encrypted under the old key
#    would then fail to decrypt. Keep one key for the life of the database:
#    WSO2_ENCRYPTION_KEY if set, else the key saved next to the database, else
#    the one already in this container's config, else a new one.
keyfile=$home/repository/database/.opengate-encryption-key
key=${WSO2_ENCRYPTION_KEY:-}
[ -z "$key" ] && [ -f "$keyfile" ] && key=$(cat "$keyfile")
[ -z "$key" ] && key=$(sed -n '/^\[encryption\]$/,/^key = /s/^key = "\(.*\)"$/\1/p' "$conf")
[ -z "$key" ] && key=$(od -An -tx1 -N32 /dev/urandom | tr -d ' \n')
case $key in
  *[!0-9a-f]* | "") echo "OpenGate: the WSO2 encryption key must be hex" >&2; exit 1 ;;
esac
[ -z "${WSO2_ENCRYPTION_KEY:-}" ] && [ ! -f "$keyfile" ] && { umask 077; printf '%s' "$key" >"$keyfile"; }
sed -i '/^\[encryption\]$/,/^key = /d' "$conf"
printf '\n[encryption]\nkey = "%s"\n' "$key" >>"$conf"

# 4. Public hostnames (optional), for running behind a reverse proxy on 443.
#    WSO2_HOSTNAME is where the Publisher is reached (e.g. portal.example.com):
#    WSO2 builds its login redirects and portal URLs from it. WSO2_GATEWAY_HOST
#    is the gateway's public name (e.g. gateway.example.com): it becomes the
#    Default gateway's vhost, so the URLs OpenGate shows developers use it.
if [ -n "${WSO2_HOSTNAME:-}" ]; then
  sed -i '/^\[server\]$/,/^\[/s/^hostname = .*/hostname = "'"$WSO2_HOSTNAME"'"/' "$conf"
  grep -q "^hostname = \"$WSO2_HOSTNAME\"" "$conf" ||
    echo "OpenGate: warning: no [server] hostname line to set in deployment.toml" >&2
  sed -i '/^# opengate-proxy-start$/,/^# opengate-proxy-end$/d' "$conf"
  if grep -q '^\[transport\.https\.properties\]' "$conf"; then
    echo "OpenGate: warning: [transport.https.properties] already exists; set proxyPort = 443 there" >&2
  else
    printf '# opengate-proxy-start\n[transport.https.properties]\nproxyPort = 443\n# opengate-proxy-end\n' >>"$conf"
  fi
fi
if [ -n "${WSO2_GATEWAY_HOST:-}" ]; then
  sed -i -e 's#^http_endpoint = .*#http_endpoint = "http://'"$WSO2_GATEWAY_HOST"'"#' \
         -e 's#^https_endpoint = .*#https_endpoint = "https://'"$WSO2_GATEWAY_HOST"'"#' "$conf"
  grep -q "^https_endpoint = \"https://$WSO2_GATEWAY_HOST\"" "$conf" ||
    echo "OpenGate: warning: no gateway https_endpoint line to set in deployment.toml" >&2
fi

# 5. Admin password (optional). WSO2 creates the admin account from
#    [super_admin] on a fresh database, and also uses that password for its
#    own internal calls, so the file and the account must agree. Set
#    WSO2_ADMIN_PASSWORD before the first start; for an existing database,
#    change the password in /carbon first, then set it here to match. The
#    file refers to the variable ($env{...}, which WSO2 resolves at start-up)
#    rather than holding the password itself.
if [ -n "${WSO2_ADMIN_PASSWORD:-}" ]; then
  sed -i '/^\[super_admin\]$/,/^\[/s|^password = .*|password = "$env{WSO2_ADMIN_PASSWORD}"|' "$conf"
  grep -q '^password = "$env{WSO2_ADMIN_PASSWORD}"' "$conf" ||
    echo "OpenGate: warning: no [super_admin] password line to set in deployment.toml" >&2
fi

exec /home/wso2carbon/docker-entrypoint.sh "$@"
