"""Convert each recorded take to audio-final/NN_<scene>.wav (48 kHz stereo) and write durations.json.

Reads ledger.tsv (scene -> take file). Never overwrites a wav. Re-run it as new takes arrive.
Run: ~/.venvs/kyaloon-manim/bin/python prep_audio.py
"""
import json
import os
import subprocess

MEDIA = os.path.expanduser("~/kyaloon-media/explainer-harness-mastra-2026-11-07")
TAKES = os.path.join(MEDIA, "takes")
FINAL = os.path.join(MEDIA, "audio-final")


def ledger():
    """scene -> take file; a later row for the same scene wins."""
    rows = {}
    with open(os.path.join(MEDIA, "ledger.tsv")) as f:
        next(f)
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) >= 2 and parts[0]:
                rows[parts[0].replace("-", "_")] = parts[1]
    return rows


def duration(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
        capture_output=True, text=True, check=True,
    ).stdout
    return round(float(out.strip()), 3)


def main():
    os.makedirs(FINAL, exist_ok=True)
    made = []
    for scene, take in sorted(ledger().items()):
        src = os.path.join(TAKES, take)
        dst = os.path.join(FINAL, f"{scene}.wav")
        if not os.path.exists(src) or os.path.exists(dst):
            continue
        subprocess.run(
            ["ffmpeg", "-v", "error", "-n", "-i", src, "-ar", "48000", "-ac", "2", dst], check=True
        )
        made.append(scene)
    durations = {
        name[:-4]: duration(os.path.join(FINAL, name))
        for name in sorted(os.listdir(FINAL)) if name.endswith(".wav")
    }
    with open(os.path.join(MEDIA, "durations.json"), "w") as f:
        json.dump(durations, f, indent=1)
    print(f"converted {len(made)}: {made}")
    print(f"durations.json: {len(durations)} scenes, {sum(durations.values()):.1f} s")


if __name__ == "__main__":
    main()
