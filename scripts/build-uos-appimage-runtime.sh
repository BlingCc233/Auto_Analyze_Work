#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <appimage-tools-output-dir>" >&2
  exit 2
fi

output_dir="$(readlink -f "$1")"
runtime_revision="dd6cebedcbddde9c82f89b011e8e1d40b6e43868"
tools_url="https://github.com/electron-userland/electron-builder-binaries/releases/download/appimage%401.0.3/appimage-tools-runtime-20251108.tar.gz"
tools_sha256="84021a78ee214ae6fd33a2d62a92ba25542dd10bc86bf117a9b2d0bba44e7665"
work_dir="$(mktemp -d)"

cleanup() {
  rm -rf -- "$work_dir"
}
report_error() {
  local status=$?
  local source_file="${BASH_SOURCE[1]:-${BASH_SOURCE[0]}}"
  local source_line="${BASH_LINENO[0]:-unknown}"
  echo "::error title=ARMv8 AppImage runtime build failed::${source_file}:${source_line} exited with status ${status}"
  exit "$status"
}
trap report_error ERR
trap cleanup EXIT

mkdir -p "$output_dir"
git clone --quiet --depth 1 --branch 20251108 \
  https://github.com/AppImage/type2-runtime.git "$work_dir/type2-runtime"
git -C "$work_dir/type2-runtime" rev-parse HEAD | grep -qx "$runtime_revision"

# Keep every statically linked component within the ARMv8.0 baseline. The
# upstream dependency script sets CFLAGS only after building libfuse, so place
# ours before its first compilation instead.
sed -i 's/-std=gnu99 /-std=gnu99 -march=armv8-a -mno-outline-atomics /' \
  "$work_dir/type2-runtime/src/runtime/Makefile"
sed -i '4a export CFLAGS="-march=armv8-a -mno-outline-atomics -ffunction-sections -fdata-sections -Os"' \
  "$work_dir/type2-runtime/scripts/common/install-dependencies.sh"
sed -i 's/export CFLAGS="-ffunction-sections -fdata-sections -Os"/export CFLAGS="-march=armv8-a -mno-outline-atomics -ffunction-sections -fdata-sections -Os"/' \
  "$work_dir/type2-runtime/scripts/common/install-dependencies.sh"
# Alpine's prebuilt mimalloc archive is outside this controlled compilation
# path. The runtime does not call its API, so use libc allocation instead.
sed -i 's/ -lmimalloc//' \
  "$work_dir/type2-runtime/src/runtime/Makefile"

(
  cd "$work_dir/type2-runtime"
  ARCH=aarch64 scripts/docker/build-with-docker.sh
)

runtime="$work_dir/type2-runtime/out/runtime-aarch64"
test -x "$runtime"
if readelf -l "$runtime" | grep -q 'Requesting program interpreter'; then
  echo "::error title=Invalid AppImage runtime::Custom AppImage runtime must be statically linked." >&2
  exit 1
fi
lse_instruction="$(llvm-objdump --triple=aarch64 --disassemble "$runtime" \
  | grep -Ei '[[:space:]](cas[a-z]*|ldadd[a-z]*|swp[a-z]*)[[:space:]]' \
  | head -n 1 || true)"
if [[ -n "$lse_instruction" ]]; then
  echo "::error title=Unsupported ARM LSE instruction::${lse_instruction}" >&2
  exit 1
fi

tools_archive="$work_dir/appimage-tools-runtime.tar.gz"
curl --fail --location --retry 3 --retry-delay 2 --output "$tools_archive" "$tools_url"
echo "$tools_sha256  $tools_archive" | sha256sum -c -
tar -xzf "$tools_archive" -C "$output_dir"
install -m 0755 "$runtime" "$output_dir/runtimes/runtime-arm64"
