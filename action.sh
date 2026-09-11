#!/system/bin/sh
# DowvnLoadout - Core Organizer Engine for Shevery ADB

export TMPDIR=/data/local/tmp
CONFIG_DIR="/storage/emulated/0/.down-loadout"
CONFIG_FILE="$CONFIG_DIR/conveyor_config.json"

if [ ! -d "$CONFIG_DIR" ]; then
    CONFIG_DIR="/sdcard/.down-loadout"
    CONFIG_FILE="$CONFIG_DIR/conveyor_config.json"
fi

# Initialize default configuration if missing
if [ ! -f "$CONFIG_FILE" ]; then
    mkdir -p "$CONFIG_DIR" 2>/dev/null
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
    {"id":"documents","name":"Documents","folder":"! - Documents","icon":"ic-doc","exts":["pdf","doc","docx","txt","md","rtf"]},
    {"id":"spreadsheets","name":"Spreadsheets","folder":"! - Spreadsheets","icon":"ic-sheet","exts":["xls","xlsx","csv","numbers"]},
    {"id":"presentations","name":"Presentations","folder":"! - Presentations","icon":"ic-doc","exts":["ppt","pptx","key"]},
    {"id":"videos","name":"Videos","folder":"! - Videos","icon":"ic-video","exts":["mp4","mov","avi","mkv","webm"]},
    {"id":"audio","name":"Audio","folder":"! - Audio","icon":"ic-music","exts":["mp3","wav","flac","m4a","ogg"]},
    {"id":"archives","name":"Archives","folder":"! - Archives","icon":"ic-archive","exts":["zip","rar","7z","tar","gz","bz2","xz","iso","tgz"]},
    {"id":"installers","name":"Installers","folder":"Installers","icon":"ic-box","exts":["exe","msi","dmg","pkg","deb","apk"]},
    {"id":"code","name":"Code & Scripts","folder":"! - Code","icon":"ic-code","exts":["js","html","css","py","json","ts","php","cpp"]},
    {"id":"design","name":"Design Files","folder":"! - Design","icon":"ic-image","exts":["psd","ai","fig","sketch","xd","blend"]},
    {"id":"ebooks","name":"eBooks","folder":"! - eBooks","icon":"ic-doc","exts":["epub","mobi","azw3","djvu"]},
    {"id":"others","name":"Others","folder":"! - Others","icon":"ic-file","exts":[]}
  ]
}
EOF
fi

TARGET_DIR="/storage/emulated/0/Download"
[ ! -d "$TARGET_DIR" ] && TARGET_DIR="/sdcard/Download"

echo "[INFO] Starting DownLoadout organization engine..."

if [ ! -d "$TARGET_DIR" ]; then
    echo "[ERROR] Target directory '$TARGET_DIR' does not exist."
    exit 1
fi

cd "$TARGET_DIR" || exit 1
echo "[INFO] Monitored target directory: $TARGET_DIR"

INCLUDE_SUBDIRS=$(grep -o '"include_subdirs"[[:space:]]*:[[:space:]]*[a-z]*' "$CONFIG_FILE" | grep -o 'true\|false' || echo "false")
DEST_FOLDERS=$(grep -o '"folder"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_FILE" | sed -E 's/"folder"[[:space:]]*:[[:space:]]*"([^"]*)"/\1/')

DEFAULT_DEST="! - Others"
HAS_OTHERS_RULE=0

eval $(awk -v RS='}' '
  /"id"[[:space:]]*:[[:space:]]*"[^"]*"/ {
    r_id = ""; r_folder = "";
    
    if (match($0, /"id"[[:space:]]*:[[:space:]]*"[^"]*"/)) {
      str = substr($0, RSTART, RLENGTH);
      sub(/.*"id"[[:space:]]*:[[:space:]]*"/, "", str);
      sub(/".*/, "", str);
      r_id = str;
    }
    
    if (match($0, /"folder"[[:space:]]*:[[:space:]]*"[^"]*"/)) {
      str = substr($0, RSTART, RLENGTH);
      sub(/.*"folder"[[:space:]]*:[[:space:]]*"/, "", str);
      sub(/".*/, "", str);
      r_folder = str;
    }
    
    if (r_id == "others" && r_folder != "") {
      print "DEFAULT_DEST=\"" r_folder "\""
      print "HAS_OTHERS_RULE=1"
    }
    
    if (match($0, /"exts"[[:space:]]*:[[:space:]]*\[[^\]]*\]/)) {
      str = substr($0, RSTART, RLENGTH);
      sub(/.*"exts"[[:space:]]*:[[:space:]]*\[/, "", str);
      sub(/\].*/, "", str);
      gsub(/"/, "", str);
      gsub(/ /, "", str);
      n = split(str, exts_arr, ",");
      for (i = 1; i <= n; i++) {
        ext = tolower(exts_arr[i]);
        gsub(/[^a-z0-9_]/, "", ext);
        if (ext != "" && r_folder != "") {
          print "EXT_MAP_" ext "=\"" r_folder "\""
        }
      }
    }
  }
' "$CONFIG_FILE")

MOVED_COUNT=0

is_incomplete_file() {
    case "$1" in
        .*|.conveyor_config.json|conveyor_config.json) return 0 ;;
        *.crdownload|*.part|*.tmp|*.download|*.aria2|*.ubdownload|*.gdownload|*!ut) return 0 ;;
    esac
    return 1
}

is_dest_folder() {
    for df in $DEST_FOLDERS; do
        if [ "$1" = "$df" ]; then return 0; fi
    done
    return 1
}

echo "[INFO] Scanning for organizeable files..."

if [ "$INCLUDE_SUBDIRS" = "true" ]; then
    PRUNE_EXPR=""
    for df in $DEST_FOLDERS; do
        [ -z "$PRUNE_EXPR" ] && PRUNE_EXPR="-name \"$df\"" || PRUNE_EXPR="$PRUNE_EXPR -o -name \"$df\""
    done
    FIND_CMD="find . \( -name \".*\" $PRUNE_EXPR \) -prune -o -type f -print"
else
    FIND_CMD="find . -maxdepth 1 -type f -print"
fi

eval "$FIND_CMD" | while IFS= read -r filepath; do
    [ -z "$filepath" ] && continue
    [ -f "$filepath" ] || continue
    filename=$(basename "$filepath")

    if is_incomplete_file "$filename"; then continue; fi

    dirpath=$(dirname "$filepath")
    if [ "$dirpath" != "." ]; then
        top_dir=$(echo "$dirpath" | cut -d'/' -f2)
        if is_dest_folder "$top_dir"; then continue; fi
    fi

    ext="${filename##*.}"
    [ "$ext" = "$filename" ] && ext=""
    ext_lower=$(echo "$ext" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9_')

    eval "dest=\$EXT_MAP_${ext_lower}"

    # Handle secondary backup extensions (e.g. .png.bak)
    if [ "$ext_lower" = "bak" ] || [ -z "$dest" ]; then
        stem="${filename%.*}"
        sec_ext="${stem##*.}"
        if [ "$sec_ext" != "$stem" ] && [ -n "$sec_ext" ]; then
            sec_ext_lower=$(echo "$sec_ext" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9_')
            eval "sec_dest=\$EXT_MAP_${sec_ext_lower}"
            if [ -n "$sec_dest" ]; then
                dest="$sec_dest"
            fi
        fi
    fi

    # If no mapping found and "Others" rule is disabled, ignore the file
    if [ -z "$dest" ]; then
        if [ "$HAS_OTHERS_RULE" -eq 1 ]; then
            dest="$DEFAULT_DEST"
        else
            continue
        fi
    fi

    mkdir -p "$dest"
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
        MOVED_COUNT=$((MOVED_COUNT + 1))
        echo "[OK] Moved: $filename -> $dest/"
    fi
done

echo "[SUCCESS] Execution completed. $MOVED_COUNT file(s) organized."
echo "SUCCESS_MOVED_COUNT:$MOVED_COUNT"
exit 0