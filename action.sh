#!/system/bin/sh
# DownLoadout - Core Organizer Engine for Shevery ADB

export TMPDIR="${TMPDIR:-/data/local/tmp}"
BASE_DIR="${DL_BASE:-/storage/emulated/0}"
[ -d "$BASE_DIR" ] || BASE_DIR="/sdcard"

# Module settings live in their own dedicated directory (public, under Download).
# This replaces the old hidden /sdcard/.down-loadout dot-folder.
SETTINGS_DIR="$BASE_DIR/Download/DownLoadout"
CONFIG_FILE="$SETTINGS_DIR/conveyor_config.json"
LEGACY_DIR="$BASE_DIR/.down-loadout"

# One-time migration from the legacy dot-folder location
if [ ! -f "$CONFIG_FILE" ] && [ -f "$LEGACY_DIR/conveyor_config.json" ]; then
    mkdir -p "$SETTINGS_DIR" 2>/dev/null
    mv "$LEGACY_DIR/conveyor_config.json" "$CONFIG_FILE" 2>/dev/null
fi

# Initialize default configuration if missing
if [ ! -f "$CONFIG_FILE" ]; then
    mkdir -p "$SETTINGS_DIR" 2>/dev/null
    cat > "$CONFIG_FILE" << 'EOF'
{
  "target_folder": "/storage/emulated/0/Download",
  "schedule_hours": 0,
  "custom_interval": "",
  "include_subdirs": false,
  "show_console_logs": true,
  "active_days": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  "last_run": 0,
  "rules": [
    {"id":"images","name":"Images","folder":"! - Images","icon":"ic-image","exts":["jpg","jpeg","png","gif","webp","svg","heic","bmp"]},
    {"id":"documents","name":"Documents","folder":"! - Documents","icon":"ic-doc","exts":["pdf","doc","docx","txt","md"]},
    {"id":"videos","name":"Videos","folder":"! - Videos","icon":"ic-video","exts":["mp4","mov","avi","mkv","webm"]},
    {"id":"audio","name":"Audio","folder":"! - Audio","icon":"ic-music","exts":["mp3","wav","flac","m4a","ogg"]},
    {"id":"archives","name":"Archives","folder":"! - Archives","icon":"ic-archive","exts":["zip","rar","7z","tar","gz","bz2","xz","iso","tgz"]},
    {"id":"installers","name":"Installers","folder":"Installers","icon":"ic-box","exts":["exe","msi","dmg","pkg","deb","apk","apks"]}
  ]
}
EOF
fi

[ ! -f "$CONFIG_FILE" ] && { echo "[ERROR] Could not create configuration file."; exit 1; }

TARGET_DIR="$BASE_DIR/Download"
[ ! -d "$TARGET_DIR" ] && TARGET_DIR="$BASE_DIR/Download"
[ ! -d "$TARGET_DIR" ] && { echo "[ERROR] Target directory '$TARGET_DIR' does not exist."; exit 1; }

echo "[INFO] Starting DownLoadout organization engine..."
echo "[INFO] Monitored target directory: $TARGET_DIR"
echo "[INFO] Settings file: $CONFIG_FILE"

cd "$TARGET_DIR" || exit 1

# --- Run lock: prevent overlapping service + manual runs ---
# Stale-lock recovery: a lock older than 10 minutes is considered abandoned.
LOCK_DIR="$TMPDIR/downloadout.lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    LOCK_AGE=$(stat -c %Y "$LOCK_DIR" 2>/dev/null || echo 0)
    if [ $(( $(date +%s) - LOCK_AGE )) -gt 600 ]; then
        rm -rf "$LOCK_DIR" 2>/dev/null
        mkdir "$LOCK_DIR" 2>/dev/null || { echo "[INFO] Another organization run is already in progress. Skipping."; exit 0; }
    else
        echo "[INFO] Another organization run is already in progress. Skipping."
        exit 0
    fi
fi

PAIRS_FILE="$TMPDIR/downloadout_pairs.$$"
COUNT_FILE="$TMPDIR/downloadout_count.$$"
echo 0 > "$COUNT_FILE"

cleanup() {
    rm -rf "$LOCK_DIR" 2>/dev/null
    rm -f "$PAIRS_FILE" "$COUNT_FILE" 2>/dev/null
}
trap cleanup EXIT HUP INT TERM

# --- Config parsing ---
INCLUDE_SUBDIRS=$(grep -o '"include_subdirs"[[:space:]]*:[[:space:]]*[a-z]*' "$CONFIG_FILE" | grep -o 'true\|false' || echo "false")

# Folder names from the config are interpolated into commands; enforce a safe
# charset (letters, digits, space, underscore, dot, bang, comma, hyphen).
valid_folder() {
    # mksh cannot parse a space inside a bracket class, so delete the safe
    # character set instead: whatever remains is an unsafe character.
    [ -n "$1" ] || return 1
    rest=$(printf '%s' "$1" | tr -d ' A-Za-z0-9_,.!-')
    [ -z "$rest" ]
}

# Build a sanitized ext -> folder map as a temp pairs file instead of eval'ing
# variable assignments from config data.
TAB=$(printf '\t')
generate_pairs() {
    > "$PAIRS_FILE"
    awk -v RS='}' -v OFS="$TAB" '
      /"id"[[:space:]]*:[[:space:]]*"[^"]*"/ {
        r_folder = "";
        if (match($0, /"folder"[[:space:]]*:[[:space:]]*"[^"]*"/)) {
          str = substr($0, RSTART, RLENGTH);
          sub(/.*"folder"[[:space:]]*:[[:space:]]*"/, "", str);
          sub(/".*/, "", str);
          r_folder = str;
        }
        if (match($0, /"exts"[[:space:]]*:[[:space:]]*\[[^]]*\]/)) {
          str = substr($0, RSTART, RLENGTH);
          sub(/.*"exts"[[:space:]]*:[[:space:]]*\[/, "", str);
          sub(/\].*/, "", str);
          gsub(/"/, "", str);
          gsub(/ /, "", str);
          n = split(str, exts_arr, ",");
          for (i = 1; i <= n; i++) {
            ext = tolower(exts_arr[i]);
            gsub(/[^a-z0-9_]/, "", ext);
            if (ext != "" && r_folder != "") print ext OFS r_folder;
          }
        }
      }' "$CONFIG_FILE" 2>/dev/null | while IFS="$TAB" read -r e f; do
        [ -z "$e" ] && continue
        if valid_folder "$f"; then
            printf '%s\t%s\n' "$e" "$f" >> "$PAIRS_FILE"
        else
            echo "[WARN] Skipped rule with unsafe folder name in config: $(printf '%s' "$f" | tr -cd '[:print:]')" >&2
        fi
    done
}
generate_pairs

# Look up the target folder for an extension (exact match, first rule wins).
ext_folder() {
    awk -F"$TAB" -v key="$1" 'NF == 2 && $1 == key { print $2; exit }' "$PAIRS_FILE"
}

# Unique dest folder names, newline-separated (space-safe: exact-name matching).
DEST_FOLDERS=$(awk -F"$TAB" 'NF == 2 { print $2 }' "$PAIRS_FILE" | sort -u)

is_incomplete_file() {
    case "$1" in
        .*|conveyor_config.json) return 0 ;;
        *.crdownload|*.part|*.tmp|*.download|*.aria2|*.ubdownload|*.gdownload|*!ut) return 0 ;;
    esac
    return 1
}

is_dest_folder() {
    while IFS= read -r df; do
        [ -z "$df" ] && continue
        [ "$1" = "$df" ] && return 0
    done <<EOF
$DEST_FOLDERS
EOF
    return 1
}

echo "[INFO] Scanning for organizeable files..."

case "$INCLUDE_SUBDIRS" in
    true)
        PRUNE_EXPR=""
        while IFS= read -r df; do
            [ -z "$df" ] && continue
            if valid_folder "$df"; then
                if [ -z "$PRUNE_EXPR" ]; then
                    PRUNE_EXPR="-name \"$df\""
                else
                    PRUNE_EXPR="$PRUNE_EXPR -o -name \"$df\""
                fi
            fi
        done <<EOF
$DEST_FOLDERS
EOF
        if [ -n "$PRUNE_EXPR" ]; then
            FIND_EXPR="\\( -name \".?*\" -o $PRUNE_EXPR \\) -prune -o -type f"
        else
            FIND_EXPR="\\( -name \".?*\" \\) -prune -o -type f"
        fi
        # PRUNE_EXPR only ever contains charset-validated names (no quotes,
        # backslashes or metacharacters), so eval cannot inject anything.
        run_find() { eval "find . $FIND_EXPR -print0"; }
        ;;
    *)
        run_find() { find . -maxdepth 1 -type f -print0; }
        ;;
esac

run_find 2>/dev/null | while IFS= read -r -d '' filepath; do
    [ -z "$filepath" ] && continue
    filename=$(basename "$filepath")

    if is_incomplete_file "$filename"; then
        continue
    fi

    # Skip files that already live inside a destination folder (subdir mode)
    dirpath=$(dirname "$filepath")
    if [ "$dirpath" != "." ]; then
        top_dir=$(echo "$dirpath" | cut -d'/' -f2)
        if is_dest_folder "$top_dir"; then
            continue
        fi
    fi

    ext="${filename##*.}"
    [ "$ext" = "$filename" ] && ext=""
    ext_lower=$(echo "$ext" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9_')

    dest=$(ext_folder "$ext_lower")

    # Handle secondary backup extensions (e.g. .png.bak)
    if [ "$ext_lower" = "bak" ] || [ -z "$dest" ]; then
        stem="${filename%.*}"
        sec_ext="${stem##*.}"
        if [ "$sec_ext" != "$stem" ] && [ -n "$sec_ext" ]; then
            sec_ext_lower=$(echo "$sec_ext" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9_')
            if [ -z "$dest" ]; then
                dest=$(ext_folder "$sec_ext_lower")
            fi
        fi
    fi

    # Ignore unmapped files when no category rule matches
    [ -z "$dest" ] && continue
    if ! valid_folder "$dest"; then
        echo "[WARN] Skipped file with unsafe target folder: $filename" >&2
        continue
    fi

    mkdir -p "$dest" || continue
    target_path="$dest/$filename"

    if [ -f "$target_path" ]; then
        base="${filename%.*}"
        count=1
        if [ -n "$ext_lower" ]; then
            target_path="$dest/${base}_${count}.${ext_lower}"
            while [ -f "$target_path" ]; do
                count=$((count + 1))
                target_path="$dest/${base}_${count}.${ext_lower}"
            done
        else
            target_path="$dest/${base}_${count}"
            while [ -f "$target_path" ]; do
                count=$((count + 1))
                target_path="$dest/${base}_${count}"
            done
        fi
    fi

    if mv "$filepath" "$target_path" 2>/dev/null; then
        moved=$(cat "$COUNT_FILE" 2>/dev/null || echo 0)
        moved=$((moved + 1))
        echo "$moved" > "$COUNT_FILE"
        echo "[OK] Moved: $filename -> $dest/"
    fi
done

MOVED_COUNT=$(cat "$COUNT_FILE" 2>/dev/null || echo 0)
echo "[SUCCESS] Execution completed. $MOVED_COUNT file(s) organized."
echo "SUCCESS_MOVED_COUNT:$MOVED_COUNT"
exit 0