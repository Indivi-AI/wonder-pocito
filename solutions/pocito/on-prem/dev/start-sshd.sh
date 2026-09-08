#!/bin/sh
set -eu
ssh_dir=/home/pocito/.ssh
mkdir -p "$ssh_dir"
chmod 700 "$ssh_dir"
host_key=$ssh_dir/ssh_host_ed25519_key
[ -s "$host_key" ] || ssh-keygen -q -t ed25519 -N '' -f "$host_key"
sudo mkdir -p /run/sshd
sudo /usr/sbin/sshd -e -f /etc/ssh/sshd_config_pocito
exec "$@"
