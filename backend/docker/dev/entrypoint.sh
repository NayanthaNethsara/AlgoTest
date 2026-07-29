#!/usr/bin/env bash
#
# Prepares the container to host isolate sandboxes, then runs the given command.
#
# On a real server systemd does this: isolate.service owns a cgroup subtree that
# systemd delegates to it (Delegate=true), and isolate finds it through the
# "auto:" cg_root setting. There is no systemd here, so we hand-build the same
# arrangement and point cg_root straight at it.
#
# Setup failures only warn. Commands like `go test` do not need a sandbox, and
# the server refuses to start on its own (runner.CheckHost) with a clearer
# message than anything this script could print.

set -uo pipefail

CGROUP=/sys/fs/cgroup
ISOLATE_CG="${CGROUP}/isolate"
NUM_BOXES="${RUN_NUM_BOXES:-${RUN_MAX_CONCURRENT:-16}}"
CONTROLLERS="+cpu +memory +pids"

warn() { echo "entrypoint: $*" >&2; }

setup_cgroups() {
    if [[ ! -f ${CGROUP}/cgroup.controllers ]]; then
        warn "cgroup v2 is not mounted at ${CGROUP} -- needs a cgroup v2 host"
        return 1
    fi
    if [[ ! -w ${CGROUP} ]]; then
        warn "${CGROUP} is read-only -- the container must be privileged"
        return 1
    fi

    # cgroup v2 forbids a cgroup from holding processes and enabling controllers
    # for its children at the same time, and our own PID starts in the root.
    # Move everything into a leaf so the root is free to delegate.
    if [[ ! -d ${CGROUP}/init ]]; then
        mkdir -p "${CGROUP}/init" || return 1
        while read -r pid; do
            echo "${pid}" >"${CGROUP}/init/cgroup.procs" 2>/dev/null || true
        done <"${CGROUP}/cgroup.procs"
    fi

    # isolate only creates box-N groups and writes limits into them; enabling
    # the controllers they rely on is the parent's job (normally systemd's).
    echo "${CONTROLLERS}" >"${CGROUP}/cgroup.subtree_control" || return 1
    mkdir -p "${ISOLATE_CG}" || return 1
    echo "${CONTROLLERS}" >"${ISOLATE_CG}/cgroup.subtree_control" || return 1
}

# The stock config expects an "isolate" user with /etc/subuid ranges, which the
# Debian package creates but a source build does not. Assign the UID/GID block
# explicitly instead.
write_config() {
    mkdir -p /run/isolate/locks /var/local/lib/isolate
    cat >/usr/local/etc/isolate <<EOF
box_root = /var/local/lib/isolate
lock_root = /run/isolate/locks
cg_root = ${ISOLATE_CG}
first_uid = 60000
first_gid = 60000
num_boxes = ${NUM_BOXES}
EOF
}

write_config
if setup_cgroups && isolate --cg --check-config; then
    echo "entrypoint: sandbox ready (${NUM_BOXES} boxes)"
else
    warn "sandbox unavailable -- /api/v1/run will not work, other commands still will"
fi

exec "$@"
