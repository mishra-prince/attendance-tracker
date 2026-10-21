#!/usr/bin/env python3
"""Offline, descriptive Room Lab summary. This does not decide attendance or fit a gate."""
import argparse
from collections import Counter, defaultdict
import json
from pathlib import Path
import re

STATUSES = {"completed", "interrupted", "error", "device_issue"}
ZONES = {"Inside", "Corridor", "Doorway", "Adjacent room", "Other outside"}
GROUP_FIELDS = ("studyCode", "room", "profile", "zone", "door", "windows", "placement", "occupancy")


def load(paths):
    unique, duplicates = {}, 0
    for path in paths:
        doc = json.loads(Path(path).read_text(encoding="utf-8"))
        if not isinstance(doc, dict) or doc.get("format") != "threshold-room-lab-v1" or not isinstance(doc.get("samples"), list):
            raise ValueError(f"{path}: not a Room Lab v1 export")
        for sample in doc["samples"]:
            if not isinstance(sample, dict):
                raise ValueError(f"{path}: sample is not an object")
            required = (*GROUP_FIELDS, "sampleId", "phoneAlias", "manufacturer", "model", "status", "startedAt")
            if any(key not in sample for key in required):
                raise ValueError(f"{path}: missing sample metadata")
            if any(not isinstance(sample[key], str) or not sample[key].strip() for key in required if key != "profile"):
                raise ValueError(f"{path}: invalid text metadata")
            if not re.fullmatch(r"[0-9A-F]{4}", sample["studyCode"]) or type(sample["profile"]) is not int or sample["profile"] not in (0, 1, 2):
                raise ValueError(f"{path}: invalid study code or profile")
            if sample["status"] not in STATUSES or sample["zone"] not in ZONES:
                raise ValueError(f"{path}: unknown outcome or location")
            if sample["status"] == "completed":
                frames = sample.get("matchingFrames")
                if type(frames) is not int or frames < 0 or type(sample.get("expectedCodeReceived")) is not bool or sample["expectedCodeReceived"] != (frames > 0):
                    raise ValueError(f"{path}: inconsistent completed capture")
            key = sample["sampleId"]
            if key in unique:
                if unique[key] != sample:
                    raise ValueError(f"{path}: conflicting copies of sample {key}")
                duplicates += 1
            else:
                unique[key] = sample
    return list(unique.values()), duplicates


def cell(value):
    return str(value).replace("|", "\\|").replace("\n", " ").replace("\r", " ")


def ratio(numerator, denominator):
    return f"{numerator}/{denominator} ({100*numerator/denominator:.1f}%)" if denominator else "n/a"


def render(samples, duplicates):
    outcomes = Counter(s["status"] for s in samples)
    groups, phones, aliases = defaultdict(list), defaultdict(list), defaultdict(set)
    for sample in samples:
        groups[tuple(sample[key] for key in GROUP_FIELDS)].append(sample)
        phones[(sample["phoneAlias"], sample["manufacturer"], sample["model"])].append(sample)
        aliases[sample["phoneAlias"]].add((sample["manufacturer"], sample["model"]))
    lines = ["# Room Lab calibration summary", "", "Signal measurements only; not identity verification, attendance, or a 95% reliability claim.", "",
             f"{len(samples)} unique attempts; {duplicates} duplicate exported records removed by sample ID.", "",
             f"Completed: {outcomes['completed']}. Interrupted: {outcomes['interrupted']}. Errors: {outcomes['error']}. Device limitations: {outcomes['device_issue']}.", "",
             "Every saved attempt is retained. A device limitation is a reported attempt, not an estimate of how many unsupported students exist. Uninstalled apps, unsaved attempts, absent volunteers and iPhones are not measured by these exports.", "",
             "## Reception by room and conditions", "",
             "Expected/completed measures acoustic reception among completed captures. Incomplete attempts remain visible; an incomplete outside capture is **not** evidence that the room rejected it. Inside received/all is a conservative capture-and-reception figure for these attempts, not full attendance success.", "",
             "| Study / room / profile | Actual location | Door / windows | Placement / occupancy | Attempts | Completed | Expected/completed | Incomplete | Inside received/all |",
             "|---|---|---|---|---:|---:|---|---:|---|"]
    for group, rows in sorted(groups.items()):
        code, room, profile, zone, door, windows, placement, occupancy = group
        completed = [s for s in rows if s["status"] == "completed"]
        received = sum(s["expectedCodeReceived"] for s in completed)
        values = (f"{code} / {room} / {profile}", zone, f"{door} / {windows}", f"{placement} / {occupancy}", len(rows), len(completed), ratio(received, len(completed)), len(rows)-len(completed), ratio(received, len(rows)) if zone == "Inside" else "—")
        lines.append("| " + " | ".join(map(cell, values)) + " |")
    lines += ["", "Profiles: 0 = 3/4 kHz; 1 = 17/18 kHz; 2 = 19/20 kHz. Doorway is a separate condition. Any corridor reception exposes leakage for that condition. No BLE threshold is fitted or applied.", "",
              "## Phone coverage and scan availability", "",
              "| Phone alias / model | Attempts | Completed | Interrupted / errors / limitations | BLE requested | BLE completed scans | Non-built-in or unknown audio input |",
              "|---|---:|---:|---|---:|---:|---:|"]
    for (alias, manufacturer, model), rows in sorted(phones.items()):
        counts = Counter(s["status"] for s in rows)
        requested = sum(s.get("bluetoothRequested") is True for s in rows)
        scans = sum(s.get("bluetoothRequested") is True and s.get("bluetooth", {}).get("state") == "completed" for s in rows)
        external = sum(s["status"] == "completed" and s.get("inputType") != 15 for s in rows)
        values = (f"{alias} / {manufacturer} {model}", len(rows), counts['completed'], f"{counts['interrupted']} / {counts['error']} / {counts['device_issue']}", requested, scans, external)
        lines.append("| " + " | ".join(map(cell, values)) + " |")
    for alias, models in sorted(aliases.items()):
        if len(models) > 1:
            lines += ["", f"**Label collision:** {cell(alias)} appears on more than one model. Assign unique anonymous phone labels before comparing devices."]
    lines += ["", "A completed BLE scan can have zero beacon readings. Inspect each export's `bluetooth.inside` and `bluetooth.corridor` readings separately; matching audio or similar RSSI does not identify a person carrying two phones.", "",
              "## Interpretation", "",
              "Keep different days, phones, room positions and conditions visible when reviewing the source exports. These repeated samples are correlated, so a pooled percentage or a narrow confidence interval would not establish classroom-wide performance. Use later days and previously unused phones for validation after choosing settings.", "",
              "If near-ultrasonic reception fails at legitimate seats, or succeeds in the corridor under normal door/window conditions, the tested setup has not established a usable room boundary. Do not award or remove attendance from this report. Face identity and presentation-attack resistance require a separate pilot.", ""]
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("exports", nargs="+", type=Path)
    parser.add_argument("--output", type=Path, help="Write a Markdown report; otherwise print it")
    args = parser.parse_args()
    try:
        samples, duplicates = load(args.exports)
        report = render(samples, duplicates)
        if args.output:
            args.output.write_text(report, encoding="utf-8")
        else:
            print(report)
    except (ValueError, OSError, TypeError) as error:
        parser.exit(1, f"Cannot summarize exports: {error}\n")


if __name__ == "__main__":
    main()
