#!/system/bin/sh
export TMPDIR=/data/local/tmp
CONFIG_DIR="/storage/emulated/0/.down-loadout"
[ ! -d "$CONFIG_DIR" ] && CONFIG_DIR="/sdcard/.down-loadout"
CONFIG_FILE="$CONFIG_DIR/conveyor_config.json"

case "$1" in
    get)
        if [ -f "$CONFIG_FILE" ]; then
            cat "$CONFIG_FILE"
        else
            echo '{"error": "Config file not found"}'
        fi
        ;;
    save)
        mkdir -p "$CONFIG_DIR" 2>/dev/null
        cat > "$CONFIG_FILE"
        echo '{"ok": true}'
        ;;
    *)
        echo "Usage: $0 {get|save}"
        exit 1
        ;;
esac