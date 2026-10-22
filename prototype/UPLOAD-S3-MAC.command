#!/bin/zsh
set -eu
task_dir="${0:A:h:h:h:h}"
repo_dir="${0:A:h:h}"
serial_port="${1:-/dev/cu.usbmodem101}"
python_bin="$task_dir/work/esp32-tools/venv/bin/python"
firmware_bin="$repo_dir/prototype/firmware/threshold-s3-demo.merged.bin"
if [[ ! -x "$python_bin" ]]; then
  print "This launcher uses the ESP32 toolchain prepared on Prince’s Mac. See SUBMISSION-GUIDE.md for another computer."
  exit 1
fi
export TMPDIR="$task_dir/work/tmp"
"$python_bin" "$repo_dir/prototype/upload_s3.py" --port "$serial_port" --python "$python_bin" --firmware "$firmware_bin" --backup-dir "$task_dir/work/hardware/backups" --flash
