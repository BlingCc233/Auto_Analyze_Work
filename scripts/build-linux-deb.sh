#!/usr/bin/env bash
set -euo pipefail

version="${1:?version is required}"
source_dir="${2:-dist/linux-arm64-unpacked}"
output_file="${3:-dist/Yunjiaokou-Patrol-v${version}-Linux-aarch64.deb}"

if [[ ! -x "${source_dir}/qh-duty-desk" ]]; then
  echo "ARM64 unpacked application is missing: ${source_dir}/qh-duty-desk" >&2
  exit 1
fi

package_root="$(mktemp -d)"
trap 'rm -rf -- "${package_root}"' EXIT
install_root="${package_root}/opt/yunjiaokou-patrol"

mkdir -p \
  "${package_root}/DEBIAN" \
  "${install_root}" \
  "${package_root}/usr/bin" \
  "${package_root}/usr/share/applications" \
  "${package_root}/usr/share/icons/hicolor/512x512/apps"
cp -a "${source_dir}/." "${install_root}/"
ln -s /opt/yunjiaokou-patrol/qh-duty-desk \
  "${package_root}/usr/bin/qh-duty-desk"
install -m 0644 build/icons/512x512.png \
  "${package_root}/usr/share/icons/hicolor/512x512/apps/qh-duty-desk.png"

installed_size="$(du -sk "${package_root}" | cut -f1)"
cat > "${package_root}/DEBIAN/control" <<EOF
Package: qh-duty-desk
Version: ${version}
Section: utils
Priority: optional
Architecture: arm64
Maintainer: blingcc <1342171891@qq.com>
Installed-Size: ${installed_size}
Depends: libgtk-3-0, libnss3, libxss1, libxtst6, libatspi2.0-0, libuuid1, libsecret-1-0, libgbm1, libasound2, xdg-utils
Description: Yunjiaokou patrol record workbench
 OCR-assisted patrol photo classification and official record preparation.
EOF

cat > "${package_root}/usr/share/applications/qh-duty-desk.desktop" <<'EOF'
[Desktop Entry]
Name=韵家口巡查工作台
Comment=韵家口大队巡查记录工作台
Exec=/opt/yunjiaokou-patrol/qh-duty-desk %U
Terminal=false
Type=Application
Icon=qh-duty-desk
Categories=Utility;
StartupWMClass=qh-duty-desk
EOF

mkdir -p "$(dirname "${output_file}")"
dpkg-deb --build --root-owner-group "${package_root}" "${output_file}"
dpkg-deb --info "${output_file}" >/dev/null
