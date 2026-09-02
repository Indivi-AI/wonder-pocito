#!/bin/sh
set -eu
ssh_dir=/home/pocito/.ssh
key_file=${POCITO_AUTHORIZED_KEYS_FILE:-/run/secrets/pocito_authorized_keys}
mkdir -p "$ssh_dir" /var/lib/pocito/ssh
chmod 700 "$ssh_dir" /var/lib/pocito/ssh
if [ -n "${POCITO_AUTHORIZED_KEY:-}" ]; then printf '%s\n' "$POCITO_AUTHORIZED_KEY" > "$ssh_dir/authorized_keys"
elif [ -r "$key_file" ]; then cp "$key_file" "$ssh_dir/authorized_keys"
elif [ ! -s "$ssh_dir/authorized_keys" ]; then echo "Mount $key_file or set POCITO_AUTHORIZED_KEY" >&2; exit 1
fi
chmod 600 "$ssh_dir/authorized_keys"
host_key=/var/lib/pocito/ssh/ssh_host_ed25519_key
[ -s "$host_key" ] || ssh-keygen -q -t ed25519 -N '' -f "$host_key"
exec /usr/sbin/sshd -D -e -f /etc/ssh/sshd_config_pocito
