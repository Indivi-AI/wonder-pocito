#!/bin/sh
set -eu
ssh_dir=/home/pocito/.ssh
mkdir -p "$ssh_dir"
chmod 700 "$ssh_dir"
host_key=$ssh_dir/ssh_host_ed25519_key
[ -s "$host_key" ] || ssh-keygen -q -t ed25519 -N '' -f "$host_key"
env | grep -E '^(PATH|POCITO_[A-Z_]+|PI_CODING_AGENT_DIR|UV_[A-Z_]+|OTEL_[A-Z_]+|TIKTOKEN_CACHE_DIR)=' > "$ssh_dir/environment"
chmod 600 "$ssh_dir/environment"
sudo mkdir -p /run/sshd
sudo /usr/sbin/sshd -e -f /etc/ssh/sshd_config_pocito
exec "$@"
