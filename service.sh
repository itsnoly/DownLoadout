#!/system/bin/sh
# DownTidy - Background Interval Scheduler Service Daemon for Shevery ADB

export TMPDIR="${TMPDIR:-/data/local/tmp}"
BASE_DIR="${DL_BASE:-/storage/emulated/0}"
[ -d "$BASE_DIR" ] || BASE_DIR="/sdcard"

# Module settings live in their own dedicated directory (public, under Download).
SETTINGS_DIR="$BASE_DIR/Download/DownTidy"
CONFIG_FILE="$SETTINGS_DIR/conveyor_config.json"
LEGACY_DL_DIR="$BASE_DIR/Download/DownTidy"
LEGACY_DIR="$BASE_DIR/.downtidy"

# Backward-compatible migration from legacy folder locations
if [ ! -f "$CONFIG_FILE" ]; then
    mkdir -p "$SETTINGS_DIR" 2>/dev/null
    if [ -f "$LEGACY_DL_DIR/conveyor_config.json" ]; then
        cp "$LEGACY_DL_DIR/conveyor_config.json" "$CONFIG_FILE" 2>/dev/null
    elif [ -f "$LEGACY_DIR/conveyor_config.json" ]; then
        mv "$LEGACY_DIR/conveyor_config.json" "$CONFIG_FILE" 2>/dev/null
    fi
fi

# Clean up any legacy background service instances
LEGACY_PID_FILE="$TMPDIR/downtidy_service.pid"
if [ -f "$LEGACY_PID_FILE" ]; then
    OLD_LEGACY_PID=$(cat "$LEGACY_PID_FILE" 2>/dev/null)
    if [ -n "$OLD_LEGACY_PID" ] && kill -0 "$OLD_LEGACY_PID" 2>/dev/null; then
        kill -9 "$OLD_LEGACY_PID" 2>/dev/null
    fi
    rm -f "$LEGACY_PID_FILE" 2>/dev/null
fi

# Ensure single background daemon instance via PID file
SERVICE_PID_FILE="$TMPDIR/downtidy_service.pid"
if [ -f "$SERVICE_PID_FILE" ]; then
    OLD_PID=$(cat "$SERVICE_PID_FILE" 2>/dev/null)
    if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
        echo "[INFO] DownTidy service daemon is already running (PID: $OLD_PID)."
        exit 0
    fi
fi

# Define persistent daemon loop
run_daemon_loop() {
    echo "$$" > "$SERVICE_PID_FILE" 2>/dev/null

    cleanup() {
        rm -f "$SERVICE_PID_FILE" 2>/dev/null
    }
    trap cleanup EXIT HUP INT TERM

    MODDIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd)"

    while true; do
        if [ ! -f "$CONFIG_FILE" ]; then
            sleep 10
            continue
        fi

        CFG_FLAT=$(tr -d '\r\n' < "$CONFIG_FILE" 2>/dev/null)
        if [ -z "$CFG_FLAT" ]; then
            sleep 5
            continue
        fi

        # Force POSIX/English day abbreviations (Mon, Tue, Wed, Thu, Fri, Sat, Sun)
        CURRENT_DAY=$(LC_ALL=C date '+%a' 2>/dev/null || date '+%a')
        IS_DAY_ACTIVE=$(echo "$CFG_FLAT" | grep -o '"active_days"[[:space:]]*:[[:space:]]*\[[^]]*\]' | grep -i "$CURRENT_DAY")

        if [ -n "$IS_DAY_ACTIVE" ]; then
            INTERVAL_SEC=0
            CUSTOM_INTERVAL=$(echo "$CFG_FLAT" | grep -o '"custom_interval"[[:space:]]*:[[:space:]]*"[^"]*"' | sed -E 's/.*"custom_interval"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/')

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
                SCHEDULE_HOURS=$(echo "$CFG_FLAT" | grep -o '"schedule_hours"[[:space:]]*:[[:space:]]*[0-9]*' | grep -o '[0-9]*' || echo 0)
                if [ "$SCHEDULE_HOURS" -gt 0 ]; then
                    INTERVAL_SEC=$((SCHEDULE_HOURS * 3600))
                fi
            fi

            if [ "$INTERVAL_SEC" -gt 0 ]; then
                LAST_RUN=$(echo "$CFG_FLAT" | grep -o '"last_run"[[:space:]]*:[[:space:]]*[0-9]*' | grep -o '[0-9]*' || echo 0)
                NOW=$(date +%s)
                ELAPSED=$((NOW - LAST_RUN))

                if [ "$ELAPSED" -ge "$INTERVAL_SEC" ]; then
                    LOCK_DIR="$TMPDIR/downtidy.lock"
                    IS_LOCKED=0
                    if [ -d "$LOCK_DIR" ]; then
                        LOCK_AGE=$(stat -c %Y "$LOCK_DIR" 2>/dev/null || echo 0)
                        if [ $(( NOW - LOCK_AGE )) -le 600 ]; then
                            IS_LOCKED=1
                        fi
                    fi

                    if [ "$IS_LOCKED" -eq 0 ]; then
                        EXEC_OK=0
                        if [ -f "$SETTINGS_DIR/action.sh" ]; then
                            sh "$SETTINGS_DIR/action.sh" organize >/dev/null 2>&1 && EXEC_OK=1
                        elif [ -f "$MODDIR/action.sh" ]; then
                            sh "$MODDIR/action.sh" organize >/dev/null 2>&1 && EXEC_OK=1
                        fi

                        if [ "$EXEC_OK" -eq 1 ]; then
                            NOW_END=$(date +%s)
                            sed -i "s/\"last_run\":[[:space:]]*[0-9]*/\"last_run\": $NOW_END/g" "$CONFIG_FILE" 2>/dev/null
                        fi
                    fi
                fi
            fi
        fi

        SLEEP_TIME=5
        if [ "${INTERVAL_SEC:-0}" -gt 0 ] && [ "${INTERVAL_SEC:-0}" -le 5 ]; then
            SLEEP_TIME=2
        fi
        sleep "$SLEEP_TIME"
    done
}

if [ "$1" = "--foreground" ]; then
    run_daemon_loop
else
    # Launch subshell daemon detached from caller and exit immediately
    ( run_daemon_loop ) >/dev/null 2>&1 &
    echo "[INFO] DownTidy service daemon started in background."
    exit 0
fi
