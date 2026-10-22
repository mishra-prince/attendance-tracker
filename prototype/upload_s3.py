#!/usr/bin/env python3
"""Conservative, user-run ESP32-S3 uploader. No eFuses or force options are used."""
import argparse
import datetime
import hashlib
import pathlib
import re
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", required=True)
    parser.add_argument("--python", required=True, help="Python with esptool 4.12 installed")
    parser.add_argument("--firmware", required=True)
    parser.add_argument("--backup-dir", required=True, help="Private directory outside the repository")
    parser.add_argument("--flash", action="store_true", help="After a full backup, write and verify the demo image")
    args = parser.parse_args()
    firmware = pathlib.Path(args.firmware).resolve()
    # The packaged image hash is recorded beside the image; this also supports rebuilt images.
    manifest = firmware.with_suffix(firmware.suffix + ".sha256")
    if not manifest.is_file():
        raise RuntimeError("Firmware checksum file missing; use the complete submission kit")
    expected = manifest.read_text().split()[0]
    if not re.fullmatch(r"[a-f0-9]{64}", expected) or hashlib.sha256(firmware.read_bytes()).hexdigest() != expected:
        raise RuntimeError("Firmware checksum mismatch; no device was opened")
    if firmware.stat().st_size != 4 * 1024 * 1024:
        raise RuntimeError("Expected the complete 4 MB merged image; no device was opened")
    backup_root = pathlib.Path(args.backup_dir).resolve()
    repo = pathlib.Path(__file__).resolve().parents[1]
    if backup_root == repo or repo in backup_root.parents:
        raise RuntimeError("Choose a private backup directory outside the source repository")
    backup = backup_root / datetime.datetime.now().strftime("s3-%Y%m%d-%H%M%S")
    backup.mkdir(parents=True, exist_ok=False)
    log = backup / "private-device-log.txt"
    prefix = [args.python, "-m", "esptool", "--port", args.port, "--baud", "460800"]

    def run(*command):
        result = subprocess.run(prefix + list(command), text=True, stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, timeout=600, check=False)
        with log.open("a") as stream:
            stream.write("\n" + " ".join(command) + "\n" + result.stdout)
        if result.returncode:
            raise RuntimeError("Device command failed. See the private log at " + str(log))
        return result.stdout

    print("Identifying the connected chip. Existing firmware has not been changed.", flush=True)
    identification = run("flash_id")
    if not re.search(r"(?:Chip is|chip type:?)\s+ESP32-S3", identification, re.I):
        raise RuntimeError("The connected chip was not confirmed as ESP32-S3. Nothing was flashed")
    size = re.search(r"Detected flash size:\s*(\d+)MB", identification)
    if not size or int(size[1]) not in (4, 8, 16, 32):
        raise RuntimeError("Unsupported/unknown flash capacity. Nothing was flashed")
    security = run("get_security_info")
    flags = re.search(r"Flags:\s*(0x[0-9a-fA-F]+)", security)
    if not flags or int(flags[1],16) != 0 or "Secure Boot: Disabled" not in security or "Flash Encryption: Disabled" not in security:
        raise RuntimeError("Security configuration needs expert review. No security setting or firmware was changed")
    print("ESP32-S3 confirmed; " + size[1] + " MB flash. Backing up ALL existing flash…", flush=True)
    saved = backup / "original-full-flash.bin"
    run("read_flash", "0x0", str(int(size[1]) * 1024 * 1024), str(saved))
    if saved.stat().st_size != int(size[1]) * 1024 * 1024:
        raise RuntimeError("Incomplete backup. Nothing was flashed")
    digest = hashlib.sha256(saved.read_bytes()).hexdigest()
    (backup / "SHA256SUMS.txt").write_text(digest + "  " + saved.name + "\n")
    print("Full backup saved privately at " + str(backup), flush=True)
    if not args.flash:
        print("Backup complete. No firmware changed. Use --flash to program the demo.")
        return
    print("Writing the known 4 MB prototype layout; remaining capacity is unused…", flush=True)
    run("write_flash", "--flash_mode", "dio", "--flash_freq", "80m", "--flash_size", "4MB", "0x0", str(firmware))
    run("verify_flash", "0x0", str(firmware))
    print("Flash contents verified. ESP32-S3 should now advertise the A17C inside beacon.", flush=True)
    print("Open Threshold Prototype → Find ESP32 on an Android phone to confirm radio reception.")
    print("Physical Bluetooth reception still needs that phone check. No secure-boot/encryption fuse was modified.")


if __name__ == "__main__":
    try:
        main()
    except (Exception, KeyboardInterrupt) as error:
        print("STOPPED: " + str(error), file=sys.stderr)
        sys.exit(1)
