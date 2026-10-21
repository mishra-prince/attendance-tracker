import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("analyze", Path(__file__).parents[1] / "analyze.py")
analyze = importlib.util.module_from_spec(spec)
spec.loader.exec_module(analyze)


def sample(key, status="completed", zone="Inside", received=True, **extra):
    data = dict(sampleId=key, studyCode="A17C", room="R1", profile=2, zone=zone, door="Open", windows="Open", placement="On desk", occupancy="31–60", phoneAlias="P01", manufacturer="Test", model="Device", startedAt="2026-10-22T10:00:00Z", status=status, bluetoothRequested=True)
    if status == "completed":
        data.update(matchingFrames=int(received), expectedCodeReceived=received, inputType=15, bluetooth={"state":"completed"})
    data.update(extra)
    return data


class AnalyzerTests(unittest.TestCase):
    def write(self, directory, name, samples):
        path = Path(directory)/name
        path.write_text(json.dumps(dict(format="threshold-room-lab-v1", samples=samples)))
        return path

    def test_duplicate_exports_do_not_inflate_reception(self):
        with tempfile.TemporaryDirectory() as directory:
            one = self.write(directory, "one.json", [sample("a"), sample("b", "interrupted")])
            two = self.write(directory, "two.json", [sample("a"), sample("c", "error")])
            samples, duplicates = analyze.load([one, two])
            self.assertEqual((len(samples), duplicates), (3, 1))
            report = analyze.render(samples, duplicates)
            self.assertIn("1/1 (100.0%) | 2 | 1/3 (33.3%)", report)

    def test_conflicting_duplicate_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = self.write(directory, "bad.json", [sample("a"), sample("a", received=False)])
            with self.assertRaisesRegex(ValueError, "conflicting"):
                analyze.load([path])

    def test_outside_incomplete_does_not_look_like_rejection(self):
        report = analyze.render([sample("a", zone="Corridor"), sample("b", "device_issue", zone="Corridor")], 0)
        self.assertIn("1/1 (100.0%) | 1 | —", report)
        self.assertNotIn("1/2 (50.0%)", report)

    def test_profiles_and_door_conditions_stay_separate(self):
        report = analyze.render([sample("a", profile=0), sample("b", profile=2), sample("c", profile=2, door="Closed")], 0)
        self.assertEqual(report.count("| A17C / R1 /"), 3)

    def test_malformed_completed_capture_is_not_silently_skipped(self):
        with tempfile.TemporaryDirectory() as directory:
            path = self.write(directory, "bad.json", [sample("a", matchingFrames=0)])
            with self.assertRaisesRegex(ValueError, "inconsistent"):
                analyze.load([path])

    def test_alias_collision_and_device_limitations_are_visible(self):
        report = analyze.render([sample("a"), sample("b", "device_issue", model="Other")], 0)
        self.assertIn("Label collision", report)
        self.assertIn("Device limitations: 1", report)


if __name__ == "__main__":
    unittest.main()
