#!/bin/bash
# 一次性脚本：用 WSL 的 Swift 6.3.3 对 iOS 工程 Swift 文件做语法解析校验
set -u
SWIFT=/opt/swift/usr/bin/swiftc
ROOT="/mnt/d/DeepSeek前端代码/前端/未确定/术力口周榜/术力口/ios/HuameiApp"
[ -x "$SWIFT" ] || { echo "swiftc not found at $SWIFT"; exit 2; }
FAIL=0
while IFS= read -r -d '' f; do
  if "$SWIFT" -parse "$f" >/tmp/parse_out.txt 2>&1; then
    echo "OK   ${f##*/}"
  else
    echo "FAIL ${f##*/}"
    cat /tmp/parse_out.txt
    FAIL=1
  fi
done < <(find "$ROOT" -name '*.swift' -print0)
[ "$FAIL" -eq 0 ] && echo "ALL_SYNTAX_OK" || echo "HAS_SYNTAX_ERROR"
exit $FAIL