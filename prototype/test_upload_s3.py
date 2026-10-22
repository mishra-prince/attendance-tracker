"""Simulated uploader safety checks. These never open a serial device."""
import contextlib
import hashlib
import io
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import upload_s3


class UploadSafetyTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.firmware = self.root / "image.bin"
        self.firmware.write_bytes(bytes(4 * 1024 * 1024))
        self.firmware.with_suffix(".bin.sha256").write_text(hashlib.sha256(self.firmware.read_bytes()).hexdigest())
        self.commands = []
        self.chip = "Chip is ESP32-S3\nDetected flash size: 4MB"
        self.security = "Flags: 0x00000000\nSecure Boot: Disabled\nFlash Encryption: Disabled"
        self.backup_ok = True

    def fake(self, command, **kwargs):
        operation = command[7]
        self.commands.append(operation)
        output = "OK"
        if operation == "flash_id": output = self.chip
        if operation == "get_security_info": output = self.security
        if operation == "read_flash":
            Path(command[-1]).write_bytes(bytes(4 * 1024 * 1024 if self.backup_ok else 20))
        return subprocess.CompletedProcess(command, 0, output)

    def invoke(self, flash=True):
        args = ["upload_s3.py", "--port", "/dev/FAKE", "--python", sys.executable,
                "--firmware", str(self.firmware), "--backup-dir", str(self.root / "private")]
        if flash: args.append("--flash")
        with patch.object(sys, "argv", args), patch("subprocess.run", side_effect=self.fake), contextlib.redirect_stdout(io.StringIO()):
            upload_s3.main()

    def test_full_backup_precedes_write_and_verify(self):
        self.invoke()
        self.assertEqual(self.commands, ["flash_id", "get_security_info", "read_flash", "write_flash", "verify_flash"])

    def test_wrong_chip_never_writes(self):
        self.chip = "Chip is ESP32-C3\nDetected flash size: 4MB"
        with self.assertRaisesRegex(RuntimeError, "not confirmed"): self.invoke()
        self.assertNotIn("write_flash", self.commands)

    def test_security_flags_stop_before_backup_or_write(self):
        self.security = "Flags: 0x00000001\nSecure Boot: Enabled\nFlash Encryption: Disabled"
        with self.assertRaisesRegex(RuntimeError, "Security configuration"): self.invoke()
        self.assertNotIn("read_flash", self.commands)

    def test_truncated_backup_never_writes(self):
        self.backup_ok = False
        with self.assertRaisesRegex(RuntimeError, "Incomplete backup"): self.invoke()
        self.assertNotIn("write_flash", self.commands)

    def test_mismatched_image_hash_never_opens_device(self):
        self.firmware.with_suffix(".bin.sha256").write_text("0" * 64)
        with self.assertRaisesRegex(RuntimeError, "checksum mismatch"): self.invoke()
        self.assertEqual(self.commands, [])

    def test_backup_only_does_not_flash(self):
        self.invoke(flash=False)
        self.assertEqual(self.commands, ["flash_id", "get_security_info", "read_flash"])


if __name__ == "__main__": unittest.main()
