"""Render each scene whose take exists, at -qm (720p, 30 fps), into the media folder.

Run from this folder:
  ~/.venvs/kyaloon-manim/bin/python render_all.py              # each scene with a take and no render yet
  ~/.venvs/kyaloon-manim/bin/python render_all.py --redo KEY…   # render again; the old file moves to old/
  ~/.venvs/kyaloon-manim/bin/python render_all.py --only KEY…   # only these scenes
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
MEDIA = os.path.expanduser("~/kyaloon-media/explainer-harness-mastra-2026-11-07")
RENDER = os.path.join(MEDIA, "render")
MODULES = ["goal", "mastra", "tree", "rules", "compiler", "run", "verdict", "status"]
MANIM = os.path.expanduser("~/.venvs/kyaloon-manim/bin/manim")


def scenes():
    """[(key, module, class)] in script order."""
    out = []
    for mod in MODULES:
        if not os.path.exists(os.path.join(HERE, f"{mod}.py")):
            continue
        src = open(os.path.join(HERE, f"{mod}.py")).read()
        for cls, key in re.findall(r'class (\w+)\(HScene\):\s+key = "([^"]+)"', src):
            out.append((key, mod, cls))
    return sorted(out)


def video_path(key, mod):
    # one media dir per scene: parallel renders race on a shared texts/ cache
    return os.path.join(RENDER, "manim", key, "videos", mod, "720p30", f"{key}.mp4")


def render(job):
    key, mod, cls = job
    os.makedirs(os.path.join(RENDER, "logs"), exist_ok=True)
    log = os.path.join(RENDER, "logs", f"{key}.log")
    t0 = time.time()
    with open(log, "w") as f:
        rc = subprocess.run([MANIM, "render", "-qm", "--disable_caching", "--progress_bar", "none",
                             "--media_dir", os.path.join(RENDER, "manim", key), "-o", key, f"{mod}.py", cls],
                            cwd=HERE, stdout=f, stderr=subprocess.STDOUT).returncode
    checks = os.path.join(RENDER, "checks", f"{key}.json")
    problems = json.load(open(checks)) if os.path.exists(checks) else {}
    return key, rc, round(time.time() - t0), problems


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--redo", nargs="*", default=[])
    ap.add_argument("--only", nargs="*", default=[])
    ap.add_argument("-j", type=int, default=4)
    a = ap.parse_args()
    have = {n[:-4] for n in os.listdir(os.path.join(MEDIA, "audio-final")) if n.endswith(".wav")}
    jobs = []
    for key, mod, cls in scenes():
        if key not in have or (a.only and key not in a.only):
            continue
        out = video_path(key, mod)
        if os.path.exists(out):
            if key not in a.redo:
                continue
            old = os.path.join(RENDER, "manim", "old")
            os.makedirs(old, exist_ok=True)
            shutil.move(out, os.path.join(old, f"{key}.{time.strftime('%Y%m%d-%H%M%S')}.mp4"))
        jobs.append((key, mod, cls))
    print(f"rendering {len(jobs)}: {[j[0] for j in jobs]}", flush=True)
    failed = 0
    with ThreadPoolExecutor(a.j) as pool:
        for key, rc, secs, problems in pool.map(render, jobs):
            failed += rc != 0
            print(f"{key}: exit {rc}, {secs} s, {len(problems)} check problems", flush=True)
            for p, t in problems.items():
                print(f"    {t:6.1f} s  {p}", flush=True)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
