#!/usr/bin/env bash
#
# Provisions a Linux host to run the /api/v1/run sandbox.
#
# The runner executes untrusted code with isolate (https://github.com/ioi/isolate)
# rather than one Docker container per request, so the language toolchains live
# on the host instead of in per-language images. Toolchain versions here match
# what the retired judge images pinned: g++ 13, JDK 21, Python 3.12.
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
    g++-13 \
    openjdk-21-jdk-headless \
    python3.12

# The sandbox resolves bare command names against its own PATH, so the
# versioned binaries need stable names.
update-alternatives --install /usr/bin/g++ g++ /usr/bin/g++-13 100
update-alternatives --install /usr/bin/gcc gcc /usr/bin/gcc-13 100

# Nearly every C++ submission opens with <bits/stdc++.h>, and parsing it is the
# bulk of a compile: measured 510ms without this, 110ms with. g++ picks the
# .gch up automatically whenever the flags match, so submissions need no
# special flags -- but the flags below must stay in step with runner's
# compileCmd, or g++ silently falls back to parsing the header.
echo "==> precompiling <bits/stdc++.h>"
STDCXX_HEADER="$(find /usr/include -path '*/c++/*/bits/stdc++.h' | head -1)"
if [[ -n "${STDCXX_HEADER}" ]]; then
    g++ -O2 -std=c++17 -x c++-header "${STDCXX_HEADER}" -o "${STDCXX_HEADER}.gch"
    echo "    $(du -h "${STDCXX_HEADER}.gch" | cut -f1) at ${STDCXX_HEADER}.gch"
else
    echo "    header not found, skipping (compiles will be ~400ms slower)" >&2
fi

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

# Per-run workspaces are bind-mounted into the sandbox, which puts them outside
# isolate's --quota, and --fsize caps only one file at a time. A submission that
# ignores SIGXFSZ and writes many files just under that limit wrote 301 MB in a
# single run during testing, so the workspace root needs a ceiling of its own.
# Run the server with RUN_WORK_ROOT=${WORK_ROOT} to use it.
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

echo "==> precompiling bits/stdc++.h"
find /usr/include -name "stdc++.h" 2>/dev/null | while read -r header; do
    g++ -O2 -std=c++17 -x c++-header "$header" -o "${header}.gch" 2>/dev/null || true
done

for tool in g++ gcc node python3; do
    printf '  %-8s %s\n' "${tool}" "$(command -v "${tool}")"
done

cat <<EOF

Provisioned. Set on the server:

  RUN_ISOLATE_BIN=$(command -v isolate)
  RUN_MAX_CONCURRENT=<= ${NUM_BOXES}

Then validate end-to-end with the abuse + load suite:

  go run ./cmd/judgetest -url http://localhost:8080 -username <user> -password <pw> -burst 200
EOF
