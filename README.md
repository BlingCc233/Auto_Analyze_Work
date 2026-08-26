# 韵家口巡查工作台

## 开发验证

```bash
npm ci
npm run test:ci
npm run build
```

## 统信 UOS ARM64

`v0.0.8` 起发布两种 ARM64 Linux 产物：

- `*.tar.gz`：不依赖 FUSE，解压后直接运行目录内的 `qh-duty-desk`。
- `*.AppImage`：使用按 ARMv8.0 基线重编译的静态 runtime，不依赖 FUSE 或 LSE 原子指令；发布前会在 ARM64 CI 上执行 `--appimage-extract`，验证 runtime 本身及内层程序均可解压。

所有 Linux 产物均为 `aarch64/arm64`，不适用于 x86_64 电脑。
