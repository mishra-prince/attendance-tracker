#!/bin/zsh
set -eu
repo_dir="${0:A:h:h}"
task_dir="${repo_dir:h:h}"
python_bin="${THRESHOLD_ESP_PYTHON:-$task_dir/work/esp32-tools/venv/bin/python}"
if [[ ! -x "$python_bin" ]]; then
  print 'Set THRESHOLD_ESP_PYTHON to Python with esptool 4.12 and pyserial installed.'
  exit 1
fi
upload_mode=--flash
if [[ "${1:-}" == --verify-only ]]; then upload_mode=--verify-only; shift; fi
if (( $# > 1 )); then print 'Usage: UPLOAD-RFID-S3-MAC.command [--verify-only] [serial-port]'; exit 1; fi
serial_port="${1:-}"
if [[ -z "$serial_port" ]]; then
  ports=(/dev/cu.usbmodem*(N) /dev/cu.usbserial*(N) /dev/cu.wchusbserial*(N) /dev/cu.SLAB_USBtoUART(N))
  if (( ${#ports} != 1 )); then
    print 'Connect only the S3 or pass its serial port explicitly. Available ports:'
    print -l -- "${ports[@]}"
    exit 1
  fi
  serial_port="$ports[1]"
fi
"$python_bin" "$repo_dir/prototype/upload_s3.py" --port "$serial_port" --python "$python_bin" \
 --firmware "$repo_dir/hardware/firmware/threshold-rfid-s3-1.3.1.merged.bin" \
 --backup-dir "$task_dir/work/hardware/backups" --purpose rfid "$upload_mode"
