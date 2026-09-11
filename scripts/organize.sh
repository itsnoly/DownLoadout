#!/system/bin/sh
MODDIR="${MODDIR:-$(cd "$(dirname "$0")/.." && pwd)}"
exec sh "$MODDIR/action.sh"