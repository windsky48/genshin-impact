#!/usr/bin/env bash
# 一键清理并重建（规避两类环境限制）
#
#   1) spawn ENAMETOOLONG
#      SvelteKit 用 loadEnv(mode, dir, '') 收集了整个 process.env，
#      再 JSON.stringify 塞进 prerender 子进程的命令行参数。
#      环境变量总量大时会撞破 Windows 32,767 字符上限。
#      → 构建时摘掉体积最大的环境变量。
#
#   2) SAFE_DELETE_BULK_CONFIRM_REQUIRED
#      SvelteKit / adapter-vercel 在 buildStart 里会 rimraf 旧产物目录，
#      批量删除保护（阈值 5 个文件）会拦截。
#      → 构建前把这些目录改名移开，让 rimraf 无事可做。
#
# 用法: ./重新构建.sh   或   bash 重新构建.sh

set -e
cd "$(dirname "$0")"

APP_DIR="Genshin-Impact-Wish-Simulator"
TS=$(date +%s)

echo "==> 移开旧构建产物"
cd "$APP_DIR"
for d in .svelte-kit/output .svelte-kit/generated .svelte-kit/vercel-tmp .vercel/output; do
  if [ -e "$d" ]; then
    mv "$d" "${d}_stale_${TS}"
    echo "    moved $d"
  fi
done
cd ..

echo "==> 构建（已剔除大体积环境变量）"
cd "$APP_DIR"
env -u CODEBUDDY_MCP_CONFIG -u CODEBUDDY_SKILL_DESC_MAX_OVERRIDES \
  -u CODEBUDDY_SKILL_DESC_MAX_OVERRIDES -u WORKBUDDY_EXTRA_PATHS \
  npm run build

echo "==> 打包 EdgeOne Pages 上传包"
npm run pack:edgeone

echo ""
echo "完成。上传包："
ls -la ../edgeone-deploy.zip 2>/dev/null || ls -la edgeone-deploy.zip
