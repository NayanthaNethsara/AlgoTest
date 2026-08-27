#!/usr/bin/env bash
#
# Provisions a Linux host to run the /api/v1/run sandbox.
#
# The runner executes untrusted code with isolate (https://github.com/ioi/isolate)
# rather than one Docker container per request, so the language toolchains live
# on the host instead of in per-language images. These must match what runner's
# specs invoke: g++ for cpp, python3 for python, node for js.
#
# Target: Ubuntu 24.04 with cgroup v2. Run as root.
#
#   sudo ./provision-isolate.sh [num_boxes]
#
# num_boxes must be >= RUN_MAX_CONCURRENT, or the server refuses to start.

set -euo pipefail

NUM_BOXES="${1:-16}"
ISOLATE_REF="${ISOLATE_REF:-v2.1}"

if [[ $EUID -ne 0 ]]; then
    echo "must run as root" >&2
    exit 1
fi

# isolate 2.x requires the cgroup v2 unified hierarchy; there is no v1 fallback.
if [[ ! -f /sys/fs/cgroup/cgroup.controllers ]]; then
    echo "cgroup v2 unified hierarchy not active -- isolate 2.x cannot run here" >&2
    echo "boot with systemd.unified_cgroup_hierarchy=1 and re-run" >&2
    exit 1
fi

echo "==> installing build dependencies and language toolchains"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends \
    git make pkg-config libcap-dev libseccomp-dev libsystemd-dev asciidoc-base \
    g++ \
    python3 \
    nodejs \
    default-jdk-headless

# The sandbox resolves bare command names against its own PATH, so the
# versioned binaries need stable names.
update-alternatives --install /usr/bin/g++ g++ /usr/bin/g++-13 100
update-alternatives --install /usr/bin/gcc gcc /usr/bin/gcc-13 100

# Parsing <bits/stdc++.h> is the bulk of a C++ compile: 510ms without this, 110ms
# with. The flags must stay in step with runner's compileCmd or g++ ignores the
# .gch and parses the header as usual.
echo "==> precompiling <bits/stdc++.h>"
find /usr/include -path '*/c++/*/bits/stdc++.h' | while read -r header; do
    g++ -O2 -std=c++17 -x c++-header "${header}" -o "${header}.gch"
    echo "    $(du -h "${header}.gch" | cut -f1) at ${header}.gch"
done

echo "==> building isolate ${ISOLATE_REF}"
BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "${BUILD_DIR}"' EXIT
git clone --depth 1 --branch "${ISOLATE_REF}" https://github.com/ioi/isolate "${BUILD_DIR}/isolate"
make -C "${BUILD_DIR}/isolate" isolate
make -C "${BUILD_DIR}/isolate" install

echo "==> configuring ${NUM_BOXES} sandboxes"
CONFIG=/usr/local/etc/isolate
[[ -f /etc/isolate ]] && CONFIG=/etc/isolate

# The stock config draws sandbox UIDs from /etc/subuid via "subid_user =
# isolate". The Debian package creates that user; a source build does not, so
# assign the UID/GID block explicitly. cg_root stays on "auto:", where
# isolate-cg-keeper publishes the subtree systemd delegated to it.
cat >"${CONFIG}" <<EOF
box_root = /var/local/lib/isolate
lock_root = /run/isolate/locks
cg_root = auto:/run/isolate/cgroup
first_uid = 60000
first_gid = 60000
num_boxes = ${NUM_BOXES}
EOF

# Workspaces are bind-mounted into the sandbox, so isolate's --quota cannot bound
# them and --fsize caps only one file at a time. Run the server with
# RUN_WORK_ROOT set to this path.
WORK_ROOT=/var/local/lib/algothon-work
WORK_TMPFS_SIZE="${WORK_TMPFS_SIZE:-4G}"
echo "==> provisioning ${WORK_ROOT} as a ${WORK_TMPFS_SIZE} tmpfs"
mkdir -p "${WORK_ROOT}"
chmod 0700 "${WORK_ROOT}"
if ! grep -qs " ${WORK_ROOT} " /etc/fstab; then
    echo "tmpfs ${WORK_ROOT} tmpfs size=${WORK_TMPFS_SIZE},mode=0700 0 0" >>/etc/fstab
fi
mountpoint -q "${WORK_ROOT}" || mount "${WORK_ROOT}"

# isolate-cg-keeper holds the delegated cgroup subtree that --cg runs need.
echo "==> enabling isolate.service"
systemctl daemon-reload
systemctl enable --now isolate.service

echo "==> verifying"
isolate --cg --box-id=$((NUM_BOXES - 1)) --init >/dev/null
isolate --cg --box-id=$((NUM_BOXES - 1)) --cleanup

for tool in g++ gcc node python3 javac java; do
    printf '  %-8s %s\n' "${tool}" "$(command -v "${tool}")"
done

cat <<EOF

Provisioned. Set on the server:

  RUN_ISOLATE_BIN=$(command -v isolate)
  RUN_MAX_CONCURRENT=<= ${NUM_BOXES}

Then validate end-to-end with the abuse + load suite:

  go run ./cmd/judgetest -url http://localhost:8080 -username <user> -password <pw> -burst 200
EOF
