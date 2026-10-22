#!/usr/bin/env python3
"""Conservative, user-run ESP32-S3 uploader. No eFuses or force options are used."""
import argparse
import datetime
import hashlib
import json
import pathlib
import re
import subprocess
import sys

# Use the same explicit boot header options when writing and verifying.
FLASH_OPTIONS = ("--flash_mode", "dio", "--flash_freq", "80m", "--flash_size", "4MB")


def verification_files(firmware, output_dir, merged):
    """Verify code regions, not NVS/OTA data that startup is allowed to change."""
    manifest = json.loads(firmware.with_suffix(firmware.suffix + ".verify.json").read_text())
    if manifest.get("merged_sha256") != hashlib.sha256(merged).hexdigest():
        raise RuntimeError("Verification layout does not match this firmware")
    bounds = {"bootloader": (0, 0x8000), "partition-table": (0x8000, 0x9000), "application": (0x10000, 0x150000)}
    regions = manifest.get("regions", [])
    if len(regions) != 3 or {r.get("name") for r in regions} != set(bounds):
        raise RuntimeError("Expected bootloader, partition table and application verification regions")
    arguments = []
    for region in regions:
        name, offset, length = region["name"], region["offset"], region["length"]
        start, end = bounds[name]
        if type(offset) is not int or type(length) is not int or offset != start or length <= 0 or offset + length > end:
            raise RuntimeError("Invalid immutable firmware region")
        data = merged[offset:offset + length]
        if hashlib.sha256(data).hexdigest() != region.get("sha256"):
            raise RuntimeError("Immutable firmware region checksum mismatch")
        destination = output_dir / ("expected-" + name + ".bin")
        destination.write_bytes(data)
        arguments.extend((hex(offset), str(destination)))
    return arguments


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", required=True)
    parser.add_argument("--python", required=True, help="Python with esptool 4.12 installed")
    parser.add_argument("--firmware", required=True)
    parser.add_argument("--backup-dir", required=True, help="Private directory outside the repository")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--flash", action="store_true", help="After a full backup, write and verify the demo image")
    mode.add_argument("--verify-only", action="store_true", help="Verify installed code without backing up or writing flash")
    args = parser.parse_args()
    firmware = pathlib.Path(args.firmware).resolve()
    # The packaged image hash is recorded beside the image; this also supports rebuilt images.
    manifest = firmware.with_suffix(firmware.suffix + ".sha256")
    if not manifest.is_file():
        raise RuntimeError("Firmware checksum file missing; use the complete submission kit")
    expected = manifest.read_text().split()[0]
    merged = firmware.read_bytes()
    if not re.fullmatch(r"[a-f0-9]{64}", expected) or hashlib.sha256(merged).hexdigest() != expected:
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
    verify_arguments = verification_files(firmware, backup, merged)
    prefix = [args.python, "-m", "esptool", "--port", args.port, "--baud", "460800"]

    def run(*command):
        result = subprocess.run(prefix + list(command), text=True, stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, timeout=600, check=False)
        with log.open("a") as stream:
            stream.write("\n" + " ".join(command) + "\n" + result.stdout)
        if result.returncode:
            raise RuntimeError("Device command failed (" + command[0] + "). See the private log at " + str(log))
        return result.stdout

    print("Checking installed firmware without rewriting it." if args.verify_only else "Identifying the connected chip. Existing firmware has not been changed.", flush=True)
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
    if args.verify_only:
        print("Verifying bootloader, partition table and application. No backup or flash write will run…", flush=True)
        run("verify_flash", *FLASH_OPTIONS, *verify_arguments)
        print("Firmware code verified. No flash was erased or rewritten. Press RESET, then use Find ESP32 in Threshold.", flush=True)
        return
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
    run("write_flash", *FLASH_OPTIONS, "0x0", str(firmware))
    run("verify_flash", *FLASH_OPTIONS, *verify_arguments)
    print("Firmware code verified. ESP32-S3 should now advertise the A17C inside beacon.", flush=True)
    print("Open Threshold → Classroom demo → Find ESP32 on an Android phone to confirm radio reception.")
    print("Physical Bluetooth reception still needs that phone check. No secure-boot/encryption fuse was modified.")


if __name__ == "__main__":
    try:
        main()
    except (Exception, KeyboardInterrupt) as error:
        print("STOPPED: " + str(error), file=sys.stderr)
        sys.exit(1)
