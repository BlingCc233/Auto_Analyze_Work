# 韵家口巡查工作台

## 开发验证

```bash
npm ci
npm run test:ci
npm run build
```

## 统信 UOS ARM64

`v0.0.7` 起同时发布三种 ARM64 Linux 产物：

- `*.deb`：UOS 首选，使用系统软件安装器打开，或执行 `sudo apt install ./文件名.deb`。
- `*.tar.gz`：不依赖 FUSE，解压后直接运行目录内的 `qh-duty-desk`。
- `*.AppImage`：适合已启用 FUSE 2 的系统；缺少 FUSE 时可执行 `./文件名.AppImage --appimage-extract-and-run`。

所有 Linux 产物均为 `aarch64/arm64`，不适用于 x86_64 电脑。
