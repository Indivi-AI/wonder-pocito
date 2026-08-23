# Loads onprem.env (see onprem.env.template) into the environment. Variables already set in the shell win,
# so callers can still override per invocation (install-airgap.sh relies on this for the admin endpoint).
ONPREM_ENV_FILE="${ONPREM_ENV_FILE:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/onprem.env}"
if [[ -f "$ONPREM_ENV_FILE" ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" || "$line" == \#* || "$line" != *=* ]] && continue
    key="${line%%=*}"
    [[ -n "${!key:-}" ]] || export "$key=${line#*=}"
  done < "$ONPREM_ENV_FILE"
fi
