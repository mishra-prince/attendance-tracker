#!/bin/zsh
set -eu
repo_dir="${0:A:h:h}"
task_dir="${repo_dir:h:h}"
python_bin="${THRESHOLD_ESP_PYTHON:-$task_dir/work/esp32-tools/venv/bin/python}"
"$python_bin" "$repo_dir/hardware/provision_rfid.py" "$@"
