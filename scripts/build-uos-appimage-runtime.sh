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
trap cleanup EXIT

mkdir -p "$output_dir"
git clone --quiet --depth 1 --branch 20251108 \
  https://github.com/AppImage/type2-runtime.git "$work_dir/type2-runtime"
git -C "$work_dir/type2-runtime" rev-parse HEAD | grep -qx "$runtime_revision"

# Keep every statically linked component within the ARMv8.0 baseline.
sed -i 's/-std=gnu99 /-std=gnu99 -march=armv8-a -mno-outline-atomics /' \
  "$work_dir/type2-runtime/src/runtime/Makefile"
sed -i 's/export CFLAGS="/export CFLAGS="-march=armv8-a -mno-outline-atomics /' \
  "$work_dir/type2-runtime/scripts/common/install-dependencies.sh"

(
  cd "$work_dir/type2-runtime"
  ARCH=aarch64 scripts/docker/build-with-docker.sh
)

runtime="$work_dir/type2-runtime/out/runtime-aarch64"
test -x "$runtime"
if readelf -l "$runtime" | grep -q 'Requesting program interpreter'; then
  echo "Custom AppImage runtime must be statically linked." >&2
  exit 1
fi
if llvm-objdump --triple=aarch64 --disassemble "$runtime" \
  | grep -Eiq '[[:space:]](cas[a-z]*|ldadd[a-z]*|swp[a-z]*)[[:space:]]'; then
  echo "Custom AppImage runtime contains unsupported ARM LSE instructions." >&2
  exit 1
fi

tools_archive="$work_dir/appimage-tools-runtime.tar.gz"
curl --fail --location --retry 3 --retry-delay 2 --output "$tools_archive" "$tools_url"
echo "$tools_sha256  $tools_archive" | sha256sum -c -
tar -xzf "$tools_archive" -C "$output_dir"
install -m 0755 "$runtime" "$output_dir/runtimes/runtime-arm64"
