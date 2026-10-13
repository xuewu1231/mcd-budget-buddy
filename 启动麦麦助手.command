#!/bin/zsh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  print '需要 Node.js 22+，安装后再次启动。'
  read '?按回车退出'
  exit 1
fi
if [[ ! -d node_modules ]]; then
  print '首次使用请在此文件夹执行 npm ci，再打开启动文件。'
  read '?按回车退出'
  exit 1
fi
print '启动麦麦预算助手。将读取本机 WorkBuddy 中的 mcd-mcp 配置（如已存在）。'
print '保持此终端窗口开启，启动后请打开下方显示的网页地址。'
node scripts/start-local.mjs --workbuddy
if [[ $? -ne 0 ]]; then
  read '?启动失败，按回车退出'
fi
