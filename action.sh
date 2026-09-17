#!/system/bin/sh
# DownTidy - Core Organizer Engine for Shevery ADB

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

# Initialize default configuration if missing
if [ ! -f "$CONFIG_FILE" ]; then
    mkdir -p "$SETTINGS_DIR" 2>/dev/null
    cat > "$CONFIG_FILE" << 'EOF'
{
  "target_folder": "/storage/emulated/0/Download",
  "schedule_hours": 1,
  "custom_interval": "",
  "include_subdirs": false,
  "show_console_logs": true,
  "active_days": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  "last_run": 0,
  "rules": [
    {"id":"images","name":"Images","folder":"_Images","icon":"ic-image","exts":["jpg","jpeg","png","gif","webp","svg","heic","bmp"]},
    {"id":"documents","name":"Documents","folder":"_Documents","icon":"ic-doc","exts":["pdf","doc","docx","txt","md"]},
    {"id":"videos","name":"Videos","folder":"_Videos","icon":"ic-video","exts":["mp4","mov","avi","mkv","webm"]},
    {"id":"audio","name":"Audio","folder":"_Audio","icon":"ic-music","exts":["mp3","wav","flac","m4a","ogg"]},
    {"id":"archives","name":"Archives","folder":"_Archives","icon":"ic-archive","exts":["zip","rar","7z","tar","gz","bz2","xz","iso","tgz"]},
    {"id":"installers","name":"Installers","folder":"_Installers","icon":"ic-box","exts":["exe","msi","dmg","pkg","deb","apk","apks"]}
  ]
}
EOF
fi

[ ! -f "$CONFIG_FILE" ] && { echo "[ERROR] Could not create configuration file."; exit 1; }

TARGET_DIR="$BASE_DIR/Download"
[ ! -d "$TARGET_DIR" ] && TARGET_DIR="$BASE_DIR/Download"
[ ! -d "$TARGET_DIR" ] && { echo "[ERROR] Target directory '$TARGET_DIR' does not exist."; exit 1; }

ACTION="${1:-organize}"

if [ "$ACTION" = "move_to_download" ]; then
    echo "[INFO] Starting DownTidy Move to Download engine..."
else
    echo "[INFO] Starting DownTidy organization engine..."
fi
echo "[INFO] Monitored target directory: $TARGET_DIR"
echo "[INFO] Settings file: $CONFIG_FILE"

cd "$TARGET_DIR" || exit 1

# --- Run lock: prevent overlapping service + manual runs ---
# Stale-lock recovery: a lock older than 10 minutes is considered abandoned.
LOCK_DIR="$TMPDIR/downtidy.lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    LOCK_AGE=$(stat -c %Y "$LOCK_DIR" 2>/dev/null || echo 0)
    NOW_SEC=$(date +%s)
    if [ $(( NOW_SEC - LOCK_AGE )) -gt 600 ]; then
        rm -rf "$LOCK_DIR" 2>/dev/null
        mkdir "$LOCK_DIR" 2>/dev/null || { echo "[INFO] Another organization run is already in progress. Skipping."; exit 0; }
    else
        echo "[INFO] Another organization run is already in progress. Skipping."
        exit 0
    fi
fi

PAIRS_FILE="$TMPDIR/downtidy_pairs.$$"
MOVES_FILE="$TMPDIR/downtidy_moves.$$"

cleanup() {
    rm -rf "$LOCK_DIR" 2>/dev/null
    rm -f "$PAIRS_FILE" "$MOVES_FILE" 2>/dev/null
}
trap cleanup EXIT HUP INT TERM

# --- Config parsing ---
INCLUDE_SUBDIRS=$(grep -o '"include_subdirs"[[:space:]]*:[[:space:]]*[a-z]*' "$CONFIG_FILE" | grep -o 'true\|false' || echo "false")

# Folder names from the config are interpolated into commands; enforce a safe charset.
valid_folder() {
    [ -n "$1" ] || return 1
    rest=$(printf '%s' "$1" | tr -d ' A-Za-z0-9_,.!-')
    [ -z "$rest" ]
}

TAB=$(printf '\t')

# Build ext -> folder map in AWK
generate_pairs() {
    > "$PAIRS_FILE"
    tr -d '\r\n' < "$CONFIG_FILE" | awk -v RS='}' -v OFS="$TAB" '
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
      }' 2>/dev/null > "$PAIRS_FILE"
}
generate_pairs

# Pre-fetch destination folders list
DEST_FOLDERS=$( (grep -o '"folder"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_FILE" 2>/dev/null | sed -E 's/.*"folder"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/'; awk -F"$TAB" 'NF == 2 { print $2 }' "$PAIRS_FILE" 2>/dev/null) | sort -u )

# Ensure all destination folders exist once beforehand to minimize mkdir calls
while IFS= read -r df; do
    [ -z "$df" ] && continue
    if valid_folder "$df"; then
        mkdir -p "$df" 2>/dev/null
    fi
done <<EOF
$DEST_FOLDERS
EOF

is_incomplete_file() {
    case "$1" in
        .*|conveyor_config.json) return 0 ;;
        *.crdownload|*.part|*.tmp|*.temp|*.download|*.aria2|*.ubdownload|*.gdownload|*!ut|*.utdownload|*.ytdl|*.fdmdownload|*.opdownload|*.tdownload|*.mega|*.megadownload|*.1dm|*.idm|*.fcur|*.cur|*.enc.tmp) return 0 ;;
    esac
    return 1
}

move_with_conflict_handling() {
    src_file="$1"
    dest_dir="$2"
    filename="${src_file##*/}"

    target_path="$dest_dir/$filename"

    if [ -e "$target_path" ]; then
        ext="${filename##*.}"
        [ "$ext" = "$filename" ] && ext=""
        base="${filename%.*}"
        count=1
        if [ -n "$ext" ]; then
            target_path="$dest_dir/${base}_${count}.${ext}"
            while [ -e "$target_path" ]; do
                count=$((count + 1))
                target_path="$dest_dir/${base}_${count}.${ext}"
            done
        else
            target_path="$dest_dir/${base}_${count}"
            while [ -e "$target_path" ]; do
                count=$((count + 1))
                target_path="$dest_dir/${base}_${count}"
            done
        fi
    fi

    if mv "$src_file" "$target_path" 2>/dev/null; then
        return 0
    fi
    return 1
}

MOVED_COUNT=0

# Execute dedicated action: move_to_download
if [ "$ACTION" = "move_to_download" ]; then
    echo "[INFO] Moving category files back to Download folder..."

    CONFIG_FOLDERS=$(grep -o '"folder"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_FILE" 2>/dev/null | sed -E 's/.*"folder"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/')
    PAIR_FOLDERS=""
    [ -f "$PAIRS_FILE" ] && PAIR_FOLDERS=$(awk -F"$TAB" 'NF == 2 { print $2 }' "$PAIRS_FILE" 2>/dev/null)

    DIR_FOLDERS=""
    for d in !* Installers Documents Images Videos Audio Archives Code Design eBooks; do
        [ -d "$d" ] && DIR_FOLDERS="$DIR_FOLDERS
$d"
    done

    ALL_FOLDERS=$( (echo "$CONFIG_FOLDERS"; echo "$PAIR_FOLDERS"; echo "$DIR_FOLDERS") | sort -u )

    NOW_SEC=$(date +%s)

    OLD_IFS="$IFS"
    IFS='
'
    for df in $ALL_FOLDERS; do
        IFS="$OLD_IFS"
        [ -z "$df" ] && continue
        if ! valid_folder "$df"; then
            continue
        fi
        [ ! -d "$df" ] && continue

        for filepath in "$df"/*; do
            [ -e "$filepath" ] || continue
            [ -f "$filepath" ] || continue
            filename="${filepath##*/}"

            if is_incomplete_file "$filename"; then
                continue
            fi

            # Check active file write (modified in last 3 seconds)
            MTIME=$(stat -c %Y "$filepath" 2>/dev/null || echo 0)
            if [ $(( NOW_SEC - MTIME )) -lt 3 ]; then
                continue
            fi

            if move_with_conflict_handling "$filepath" "$TARGET_DIR"; then
                MOVED_COUNT=$((MOVED_COUNT + 1))
                echo "[OK] Moved: $df/$filename -> Download/"
            fi
        done
    done
    IFS="$OLD_IFS"

    echo "[SUCCESS] Execution completed. $MOVED_COUNT file(s) moved to Download."
    echo "SUCCESS_MOVED_COUNT:$MOVED_COUNT"
    exit 0
fi

# Execute default action: organize
echo "[INFO] Scanning for organizeable files..."

CURRENT_TIME=$(date +%s)

# Single-pass AWK engine to scan directory and resolve file mapping with maximum speed
case "$INCLUDE_SUBDIRS" in
    true)
        FIND_CMD="find . -type f"
        ;;
    *)
        FIND_CMD="find . -maxdepth 1 -type f"
        ;;
esac

$FIND_CMD 2>/dev/null | awk -F"\t" -v pairs_file="$PAIRS_FILE" -v inc_sub="$INCLUDE_SUBDIRS" -v dest_folders="$DEST_FOLDERS" '
BEGIN {
  while ((getline line < pairs_file) > 0) {
    n = split(line, parts, "\t")
    if (n == 2) {
      ext_map[tolower(parts[1])] = parts[2]
    }
  }
  close(pairs_file)

  n_df = split(dest_folders, df_arr, "\n")
  for (i = 1; i <= n_df; i++) {
    if (df_arr[i] != "") is_dest[df_arr[i]] = 1
  }
}
{
  filepath = $0
  sub(/^\.\//, "", filepath)
  
  # Extract dirpath & filename
  n = split(filepath, parts, "/")
  filename = parts[n]
  
  # Ignore hidden files, config, and incomplete download extensions
  if (filename ~ /^\./ || filename == "conveyor_config.json") next;
  if (filename ~ /\.(crdownload|part|tmp|temp|download|aria2|ubdownload|gdownload|ytdl|fdmdownload|opdownload|tdownload|mega|megadownload|1dm|idm|fcur|cur|enc\.tmp)$/ || filename ~ /!ut$/) next;

  # If in subdirectory mode, check if file is already inside a destination folder
  if (n > 1) {
    top_dir = parts[1]
    if (is_dest[top_dir]) next;
  }

  ext = ""
  sec_ext = ""
  if (filename ~ /\./) {
    n_ext = split(filename, ext_parts, ".")
    if (n_ext > 1) {
      ext = tolower(ext_parts[n_ext])
      if (n_ext > 2) sec_ext = tolower(ext_parts[n_ext - 1])
    }
  }

  gsub(/[^a-z0-9_]/, "", ext)
  gsub(/[^a-z0-9_]/, "", sec_ext)

  dest = ext_map[ext]

  if (ext == "bak" || dest == "") {
    if (sec_ext != "") {
      sec_dest = ext_map[sec_ext]
      if (sec_dest != "") dest = sec_dest;
    }
  }

  if (dest != "") {
    print filepath "\t" dest
  }
}
' > "$MOVES_FILE"

while IFS="$TAB" read -r filepath dest; do
    [ -z "$filepath" ] && continue
    filename="${filepath##*/}"

    # Skip files modified in the last 3 seconds (actively being written/downloaded)
    MTIME=$(stat -c %Y "$filepath" 2>/dev/null || echo 0)
    if [ $(( CURRENT_TIME - MTIME )) -lt 3 ]; then
        continue
    fi

    if ! valid_folder "$dest"; then
        echo "[WARN] Skipped file with unsafe target folder: $filename" >&2
        continue
    fi

    if move_with_conflict_handling "$filepath" "$dest"; then
        MOVED_COUNT=$((MOVED_COUNT + 1))
        echo "[OK] Moved: $filename -> $dest/"
    fi
done < "$MOVES_FILE"

echo "[SUCCESS] Execution completed. $MOVED_COUNT file(s) organized."
echo "SUCCESS_MOVED_COUNT:$MOVED_COUNT"
exit 0
