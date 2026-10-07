#!/bin/sh
# 本番ビルド(dist/)に /lab/* と lab専用vendorライブラリが含まれていないことを確認する。
# docs/ar-spec.md §11 P0 の完了条件「本番ビルドにlabがない」のCI上のガード。
# dist/vendor/draco・dist/vendor/meshopt は本番の /ar/onsite 等でも使うため対象外。
set -eu

fail=0

if [ -d dist/lab ]; then
  echo "NG: dist/lab が本番ビルドに含まれています"
  fail=1
fi

for name in aframe arjs; do
  if [ -d "dist/vendor/$name" ]; then
    echo "NG: dist/vendor/$name が本番ビルドに含まれています"
    fail=1
  fi
done

if [ "$fail" -ne 0 ]; then
  exit 1
fi

echo "OK: 本番ビルドに /lab・lab専用vendorは含まれていません"
