"""Scene timing from the real audio.

durations.json gives each scene's audio length. The recorded text (blocks-v2/<key>.txt) gives the
sentences. Sentence start times come from word counts, snapped to the pauses that ffmpeg silencedetect
finds in the take. A scene calls self.at("words of a sentence") to wait for that sentence, and
self.finish() to end within one frame of the audio length.
"""
import json
import os
import re
import subprocess

from manim import RoundedRectangle, Scene, Text, config

MEDIA = os.path.expanduser("~/kyaloon-media/explainer-harness-mastra-2026-11-07")
BLOCKS = os.path.join(MEDIA, "blocks-v2")


def durations():
    with open(os.path.join(MEDIA, "durations.json")) as f:
        return json.load(f)


def sentences(key):
    """[(paragraph index, sentence text, word count)] of the recorded text."""
    with open(os.path.join(BLOCKS, f"{key}.txt")) as f:
        text = f.read().strip()
    out = []
    for pi, p in enumerate(re.split(r"\n\s*\n", text)):
        for s in re.split(r"(?<=[.?!])\s+", " ".join(p.split())):
            if s:
                out.append((pi, s, len(s.split())))
    return out


def silences(wav, noise="-35dB", d=0.25):
    err = subprocess.run(["ffmpeg", "-hide_banner", "-i", wav, "-af", f"silencedetect=noise={noise}:d={d}",
                          "-f", "null", "-"], capture_output=True, text=True).stderr
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", err)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", err)]
    return list(zip(starts, ends))


class Timeline:
    def __init__(self, key):
        self.key = key
        self.total = durations()[key]
        self.sents = sentences(key)
        sil = silences(os.path.join(MEDIA, "audio-final", f"{key}.wav"))
        speech0 = sil[0][1] if sil and sil[0][0] < 0.05 else 0.0
        speech1 = sil[-1][0] if sil and sil[-1][1] > self.total - 0.1 else self.total
        words = [w for _, _, w in self.sents]
        total_w = sum(words)
        span = speech1 - speech0
        starts, acc = [], 0
        for w in words:
            starts.append(speech0 + span * acc / total_w)
            acc += w
        # snap each sentence start (after the first) to the end of the nearest pause
        snapped = [speech0]
        for i in range(1, len(starts)):
            est = starts[i]
            new_par = self.sents[i][0] != self.sents[i - 1][0]
            window = 4.0 if new_par else 2.0
            cands = [(abs(e - est) - (0.6 if new_par and (e - s) > 0.6 else 0), e)
                     for s, e in sil if abs(e - est) < window and e > snapped[-1] + 0.6]
            snapped.append(min(cands)[1] if cands else max(est, snapped[-1] + 0.6))
        self.starts = snapped

    def start_of(self, fragment):
        for (pi, s, _), t in zip(self.sents, self.starts):
            if fragment.lower() in s.lower():
                return t
        raise KeyError(f"{self.key}: no sentence holds {fragment!r}")

    def table(self):
        return [(round(t, 2), s[:60]) for (_, s, _), t in zip(self.sents, self.starts)]


class HScene(Scene):
    """A scene timed to its take. It also checks text size, text off screen, and text on text."""

    key = None

    def setup(self):
        self.tl = Timeline(self.key)
        self.problems = {}

    def now(self):
        return self.renderer.time

    def at(self, fragment, lead=0.2):
        """Wait until the voice starts the sentence that holds `fragment` (minus a short lead)."""
        dt = self.tl.start_of(fragment) - lead - self.now()
        if dt > 1 / config.frame_rate:
            self.wait(dt + 0.5 / config.frame_rate)
        elif dt < -0.6:
            self.problems.setdefault(f"late {-dt:.1f} s at {fragment!r}", round(self.now(), 1))

    def finish(self):
        dt = self.tl.total - self.now()
        if dt > 0:
            self.wait(dt + 0.5 / config.frame_rate)
        if abs(self.tl.total - self.now()) > 0.1:
            self.problems[f"length {self.now():.2f} s, audio {self.tl.total:.2f} s"] = round(self.now(), 1)
        out = os.path.join(MEDIA, "render", "checks")
        os.makedirs(out, exist_ok=True)
        with open(os.path.join(out, f"{self.key}.json"), "w") as f:
            json.dump(self.problems, f, indent=1)

    def play(self, *args, **kwargs):
        super().play(*args, **kwargs)
        self.check_texts()

    def check_texts(self):
        hw, hh = config.frame_width / 2, config.frame_height / 2
        texts = []
        for m in self.mobjects:
            for t in m.get_family():
                if isinstance(t, Text):
                    op = max((sm.get_fill_opacity() for sm in t.family_members_with_points()), default=0)
                    if op > 0.05:
                        texts.append((t, op))
        for t, op in texts:
            name = t.text[:40]
            if t.font_size < 17.5:
                self.problems.setdefault(f"small {t.font_size:.1f}: {name!r}", round(self.now(), 1))
            if t.get_left()[0] < -hw + 0.03 or t.get_right()[0] > hw - 0.03 or \
                    t.get_bottom()[1] < -hh + 0.03 or t.get_top()[1] > hh - 0.03:
                self.problems.setdefault(f"off screen: {name!r}", round(self.now(), 1))
        for m in self.mobjects:
            for r in m.get_family():
                if isinstance(r, RoundedRectangle) and r.get_stroke_opacity() > 0.05 and (
                        r.get_left()[0] < -hw or r.get_right()[0] > hw or r.get_bottom()[1] < -hh or r.get_top()[1] > hh):
                    self.problems.setdefault(f"card off screen at x {r.get_x():.1f}, y {r.get_y():.1f}", round(self.now(), 1))
        bright = [t for t, op in texts if op > 0.5]
        for i, a in enumerate(bright):
            for b in bright[i + 1:]:
                ox = min(a.get_right()[0], b.get_right()[0]) - max(a.get_left()[0], b.get_left()[0])
                oy = min(a.get_top()[1], b.get_top()[1]) - max(a.get_bottom()[1], b.get_bottom()[1])
                if ox > 0.02 and oy > 0.02:
                    small = min(a.width * a.height, b.width * b.height)
                    if ox * oy > 0.15 * small:
                        self.problems.setdefault(f"overlap: {a.text[:30]!r} / {b.text[:30]!r}", round(self.now(), 1))


if __name__ == "__main__":
    import sys
    for row in Timeline(sys.argv[1]).table():
        print(row)
