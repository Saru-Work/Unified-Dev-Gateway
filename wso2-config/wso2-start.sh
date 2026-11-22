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

exec /home/wso2carbon/docker-entrypoint.sh "$@"
