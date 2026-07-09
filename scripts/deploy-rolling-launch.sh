#!/bin/bash
# ABOUTME: Root launcher that starts the rolling deploy as a transient systemd
# ABOUTME: unit, detached from the deploy service cgroup so it survives restart.
#
# The deploy server (running as `deploy`) invokes this via a single narrow sudo
# grant: `deploy ALL=(ALL) NOPASSWD: /usr/local/sbin/deploy-rolling-launch`.
# Because it takes no arguments, the sudoers rule needs no fragile arg matching,
# and because it lives in a root-owned path (NOT the deploy-writable repo), the
# deploy user can't alter what runs as root.
#
# INSTALL (as root):
#   install -m 0755 -o root -g root \
#     /home/deploy/deploy/scripts/deploy-rolling-launch.sh \
#     /usr/local/sbin/deploy-rolling-launch
# Re-run after changing this file.

exec /usr/bin/systemd-run \
  --collect \
  --unit=deploy-rolling \
  --uid=deploy --gid=deploy \
  --setenv=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  --working-directory=/home/deploy/deploy \
  /home/deploy/deploy/scripts/rolling-deploy.sh
