#!/system/bin/sh
# DownLoadout - Action Wrapper Script
MODDIR="${MODDIR:-$(cd "$(dirname "$0")" && pwd)}"
exec sh "$MODDIR/action.sh"