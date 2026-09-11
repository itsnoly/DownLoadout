#!/system/bin/sh
# DownLoadout - Background Interval Scheduler Service

export TMPDIR=/data/local/tmp

CONFIG_DIR="/storage/emulated/0/.down-loadout"
CONFIG_FILE="$CONFIG_DIR/conveyor_config.json"

if [ ! -f "$CONFIG_FILE" ]; then
    CONFIG_DIR="/sdcard/.down-loadout"
    CONFIG_FILE="$CONFIG_DIR/conveyor_config.json"
fi

if [ ! -f "$CONFIG_FILE" ]; then
    exit 0
fi

# Check active schedule day
CURRENT_DAY=$(date '+%a')
IS_DAY_ACTIVE=$(grep -o '"active_days"[[:space:]]*:[[:space:]]*\[[^]]*\]' "$CONFIG_FILE" | grep -o "$CURRENT_DAY")

if [ -z "$IS_DAY_ACTIVE" ]; then
    exit 0
fi

INTERVAL_SEC=0
CUSTOM_INTERVAL=$(grep -o '"custom_interval"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_FILE" | sed -E 's/"custom_interval"[[:space:]]*:[[:space:]]*"([^"]*)"/\1/')

if [ -n "$CUSTOM_INTERVAL" ]; then
    VAL=$(echo "$CUSTOM_INTERVAL" | sed 's/[^0-9]//g')
    UNIT=$(echo "$CUSTOM_INTERVAL" | sed 's/[0-9]//g')
    case "$UNIT" in
        s) INTERVAL_SEC=$VAL ;;
        m) INTERVAL_SEC=$((VAL * 60)) ;;
        h) INTERVAL_SEC=$((VAL * 3600)) ;;
        *) INTERVAL_SEC=0 ;;
    esac
fi

if [ "$INTERVAL_SEC" -le 0 ]; then
    SCHEDULE_HOURS=$(grep -o '"schedule_hours"[[:space:]]*:[[:space:]]*[0-9]*' "$CONFIG_FILE" | grep -o '[0-9]*' || echo 0)
    if [ "$SCHEDULE_HOURS" -gt 0 ]; then
        INTERVAL_SEC=$((SCHEDULE_HOURS * 3600))
    fi
fi

if [ "$INTERVAL_SEC" -le 0 ]; then
    exit 0
fi

LAST_RUN=$(grep -o '"last_run"[[:space:]]*:[[:space:]]*[0-9]*' "$CONFIG_FILE" | grep -o '[0-9]*' || echo 0)
NOW=$(date +%s)
ELAPSED=$((NOW - LAST_RUN))

if [ "$ELAPSED" -ge "$INTERVAL_SEC" ]; then
    MODDIR="${MODDIR:-$(cd "$(dirname "$0")" && pwd)}"
    sh "$MODDIR/action.sh" >/dev/null 2>&1
    sed -i "s/\"last_run\":[[:space:]]*[0-9]*/\"last_run\": $NOW/g" "$CONFIG_FILE" 2>/dev/null
fi

exit 0