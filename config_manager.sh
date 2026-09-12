#!/system/bin/sh
# DownLoadout - Configuration Manager CLI

export TMPDIR="${TMPDIR:-/data/local/tmp}"
BASE_DIR="${DL_BASE:-/storage/emulated/0}"
[ -d "$BASE_DIR" ] || BASE_DIR="/sdcard"

# Module settings live in their own dedicated directory (public, under Download),
# replacing the old hidden /sdcard/.down-loadout dot-folder.
SETTINGS_DIR="$BASE_DIR/Download/DownLoadout"
CONFIG_FILE="$SETTINGS_DIR/conveyor_config.json"
LEGACY_DIR="$BASE_DIR/.down-loadout"

# One-time migration from the legacy dot-folder location
if [ ! -f "$CONFIG_FILE" ] && [ -f "$LEGACY_DIR/conveyor_config.json" ]; then
    mkdir -p "$SETTINGS_DIR" 2>/dev/null
    mv "$LEGACY_DIR/conveyor_config.json" "$CONFIG_FILE" 2>/dev/null
fi

case "$1" in
    get)
        if [ -f "$CONFIG_FILE" ]; then
            cat "$CONFIG_FILE"
        else
            echo '{"error": "Config file not found"}'
        fi
        ;;
    save)
        TMP_IN="$CONFIG_FILE.tmp.$$"
        mkdir -p "$SETTINGS_DIR" 2>/dev/null
        cat > "$TMP_IN"
        # Basic shape + folder-safety validation before the file becomes active
        if grep -q '^[[:space:]]*{' "$TMP_IN" && grep -q '}[[:space:]]*$' "$TMP_IN" && ! grep -q '"folder"[[:space:]]*:[[:space:]]*"[^"]*["$`;]' "$TMP_IN"; then
            mv "$TMP_IN" "$CONFIG_FILE"
            echo '{"ok": true}'
        else
            rm -f "$TMP_IN"
            echo '{"error": "Invalid configuration JSON rejected"}'
            exit 1
        fi
        ;;
    *)
        echo "Usage: $0 {get|save}"
        exit 1
        ;;
esac