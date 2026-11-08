"""Mux each rendered scene with its take, pull check frames, and join the scenes.

Run from this folder:
  python3 mux_all.py                      # mux each scene that has a render and a take, and no mux yet
  python3 mux_all.py --redo KEY…          # mux again; the old file moves to muxed/old/
  python3 mux_all.py --frames KEY…        # frames at 35/65/97 % of each named muxed scene (all if none)
  python3 mux_all.py --join OUT.mp4       # join all 37 muxed scenes in order (refuses an existing OUT)
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import time

from render_all import MEDIA, RENDER, scenes, video_path

MUXED = os.path.join(RENDER, "muxed")
FRAMES = os.path.join(RENDER, "frames")


def dur(path, stream=None):
    args = ["ffprobe", "-v", "error"]
    if stream:
        args += ["-select_streams", stream, "-show_entries", "stream=duration"]
    else:
        args += ["-show_entries", "format=duration"]
    out = subprocess.run(args + ["-of", "csv=p=0", path], capture_output=True, text=True).stdout.strip()
    return float(out.splitlines()[0])


def mux(redo):
    os.makedirs(MUXED, exist_ok=True)
    report = []
    for key, mod, _ in scenes():
        vid, wav = video_path(key, mod), os.path.join(MEDIA, "audio-final", f"{key}.wav")
        out = os.path.join(MUXED, f"{key}.mp4")
        if not (os.path.exists(vid) and os.path.exists(wav)):
            continue
        if os.path.exists(out):
            if key not in redo:
                continue
            os.makedirs(os.path.join(MUXED, "old"), exist_ok=True)
            shutil.move(out, os.path.join(MUXED, "old", f"{key}.{time.strftime('%Y%m%d-%H%M%S')}.mp4"))
        subprocess.run(["ffmpeg", "-v", "error", "-n", "-i", vid, "-i", wav, "-map", "0:v", "-map", "1:a",
                        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", out], check=True)
        dv, da = dur(vid), dur(wav)
        report.append((key, dv, da))
        print(f"{key}: video {dv:.2f} s, audio {da:.2f} s, diff {dv - da:+.2f}", flush=True)
    return report


def frames(keys):
    os.makedirs(FRAMES, exist_ok=True)
    for key, _, _ in scenes():
        src = os.path.join(MUXED, f"{key}.mp4")
        if (keys and key not in keys) or not os.path.exists(src):
            continue
        d = dur(src)
        for pct in (35, 65, 97):
            out = os.path.join(FRAMES, f"{key}_{pct}.png")
            if os.path.exists(out):
                os.makedirs(os.path.join(FRAMES, "old"), exist_ok=True)
                shutil.move(out, os.path.join(FRAMES, "old", f"{key}_{pct}.{time.strftime('%Y%m%d-%H%M%S')}.png"))
            subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{d * pct / 100:.2f}", "-i", src, "-frames:v", "1",
                            out], check=True)
        print(f"{key}: frames at 35/65/97 %", flush=True)


def join(out):
    if os.path.exists(out):
        sys.exit(f"refusing to overwrite {out}")
    parts = [os.path.join(MUXED, f"{k}.mp4") for k, _, _ in scenes()]
    missing = [p for p in parts if not os.path.exists(p)]
    if len(parts) != 37 or missing:
        sys.exit(f"need 37 muxed scenes; have {len(parts) - len(missing)}")
    lst = os.path.join(MUXED, "concat.txt")
    with open(lst, "w") as f:
        f.writelines(f"file '{p}'\n" for p in parts)
    subprocess.run(["ffmpeg", "-v", "error", "-n", "-f", "concat", "-safe", "0", "-i", lst, "-c:v", "copy",
                    "-c:a", "aac", "-b:a", "192k", out], check=True)
    total = sum(json.load(open(os.path.join(MEDIA, "durations.json"))).values())
    print(f"{out}: {dur(out):.2f} s, audio total {total:.2f} s")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--redo", nargs="*", default=[])
    ap.add_argument("--frames", nargs="*")
    ap.add_argument("--join")
    a = ap.parse_args()
    if a.join:
        join(a.join)
    elif a.frames is not None:
        frames(a.frames)
    else:
        mux(a.redo)
