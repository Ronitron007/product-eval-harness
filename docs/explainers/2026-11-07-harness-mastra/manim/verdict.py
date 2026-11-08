"""Part part.verdict: the three-way verdict and the bindings."""
from manim import *

from style import *
from timing import HScene

PART = "part.verdict: the three-way verdict and the bindings"


class VerdictThreeWay(HScene):
    key = "32_verdict_three_way"

    def construct(self):
        self.add(heading(PART, "pass, fail, cannot verify"))
        od = outline_beat(self, "verdicts", "bindings")
        self.at("Each check gives pass")
        self.play(FadeOut(od), run_time=0.6)
        lanes = VGroup()
        for name, col, mean in [("pass", C["pass"], "the output follows the rule"),
                                ("fail", C["fail"], "the output breaks the rule; the check gives the fix"),
                                ("cannot_verify", C["cv"], "no evidence either way")]:
            b = box(name, col, w=3.0, h=0.7, mono=True, fill=0.18)
            m = T(mean, size=22, color=FG)
            lanes.add(VGroup(b, m))
        for i, l in enumerate(lanes):
            l[0].move_to([-4.4, 1.6 - i * 1.0, 0])
            l[1].next_to(l[0], RIGHT, buff=0.5)
        self.play(LaggedStart(*[FadeIn(l[0]) for l in lanes], lag_ratio=0.3), run_time=1.1)
        self.at("That is the three-way verdict")
        tw = T("the three-way verdict", size=22, color=MUTED).next_to(VGroup(*[l[0] for l in lanes]), UP, buff=0.25)
        self.play(FadeIn(tw), run_time=0.5)
        for cue, i in [("Pass means", 0), ("Fail means", 1), ("Cannot verify means", 2)]:
            self.at(cue)
            self.play(FadeIn(lanes[i][1], shift=LEFT * 0.2), run_time=0.6)
        self.at("Think of a lab test of water")
        lab = VGroup(*[tag(t, c, size=20) for t, c in [("clean", C["pass"]), ("dirty", C["fail"]),
                                                       ("sample spoiled: test again", C["cv"])]])
        lab.arrange(RIGHT, buff=0.35)
        labt = T("a lab test of water:", size=20, color=MUTED)
        lg = VGroup(labt, lab).arrange(RIGHT, buff=0.35).move_to([0, -1.5, 0])
        self.play(FadeIn(labt), run_time=0.5)
        self.at("The result is clean")
        self.play(LaggedStart(*[FadeIn(x) for x in lab], lag_ratio=0.35), run_time=1.0)
        self.at("The third result is not a pass")
        nn = T("not a pass, not a fail", size=20, color=C["cv"]).next_to(lab[2], DOWN, buff=0.15)
        self.play(FadeIn(nn), run_time=0.5)

        self.at("Here is a real result")
        self.play(FadeOut(VGroup(lg, nn)), run_time=0.4)
        row = code_card([
            ("quotes.from_label@1   attributes[0].quote   cannot_verify", C["cv"]),
            '"The run gave no sources, so quote_in_source did not run."',
        ], size=20, title="draft B with no label text: the quote check (real)")
        row.move_to([0, -1.95, 0])
        self.at("Take draft B")
        self.play(FadeIn(row.rect), FadeIn(row[2]), run_time=0.5)
        self.at("The quote check cannot run")
        self.play(FadeIn(row.lines[0]), run_time=0.6)
        self.at("Its reason says")
        self.play(FadeIn(row.lines[1]), run_time=0.6)
        self.at("The harness never counts")
        never = T("never counted as a pass, never as a fail", size=22, color=C["cv"], weight="BOLD")
        never.next_to(row, DOWN, buff=0.25)
        self.play(FadeIn(never), run_time=0.6)
        self.at("An empty search result")
        self.play(FadeOut(never), run_time=0.3)
        empty = T("empty search result  ->  cannot_verify, not proof of absence", size=22, color=C["cv"])
        empty.next_to(row, DOWN, buff=0.25)
        self.play(FadeIn(empty), run_time=0.6)
        self.finish()


class VerdictPolicy(HScene):
    key = "33_verdict_policy"

    def construct(self):
        self.add(heading(PART, "one policy decides the verdict"))
        P, F, V = ("pass", C["pass"]), ("fail", C["fail"]), ("cannot_verify", C["cv"])
        tb = table(["case", "shape rule", "code check", "judge"], [
            ["key absent", F, V, V],
            ["empty list", ("pass []", C["pass"]), ("pass []", C["pass"]), ("pass []", C["pass"])],
            ["evidence missing", ("n/a", MUTED), V, ("n/a", MUTED)],
            ["throws / model error", ("n/a", MUTED), V, V],
            ["yes / no / unknown", "", "", ("pass / fail /\ncannot_verify", FG)],
        ], [3.6, 2.6, 2.9, 3.2], size=20, mono_cols=(1, 2, 3))
        tb.move_to([0, -0.1, 0])
        src = T("src/compiler/scorers.ts (real)", size=18, color=MUTED).next_to(tb, UP, buff=0.2).align_to(tb, LEFT)
        self.at("One policy in code decides")
        self.play(FadeIn(src), FadeIn(tb[0]), FadeIn(tb[1]), FadeIn(tb[2]), run_time=0.9)
        self.at("Missing evidence gives cannot verify")
        self.play(FadeIn(tb[3]), FadeIn(tb[4]), run_time=0.8)
        self.at("For a judge, yes gives pass")
        self.play(FadeIn(tb[5]), run_time=0.7)
        self.at("A judge error also gives")
        self.play(pulse(tb[4].cells[3], C["cv"]), run_time=0.9)
        self.at("The Mastra skip result")
        side = tag("Mastra notScorable = does not apply, and gates drop it", C["mastra"], size=20)
        side.to_edge(DOWN, buff=0.4)
        self.play(FadeIn(side), run_time=0.6)
        self.at("So the harness keeps its own rows")
        own = T("so: own rows", size=20, color=C["cv"]).next_to(side, RIGHT, buff=0.3)
        self.play(FadeIn(own), run_time=0.5)
        self.finish()


class VerdictBindingsTable(HScene):
    key = "34_verdict_bindings_table"

    def construct(self):
        self.add(heading(PART, "bindings with all three verdicts"))
        tb = table(["binding", "on fail", "on cannot verify"], [
            [("strict", C["fail"]), ("repair loop", C["model"]), ("a person", C["person"])],
            [("soft", C["rule"]), "keep + warning", "keep + note"],
            [("watch", C["cv"]), "log", "log"],
        ], [3.0, 4.2, 4.6], size=24, mono_cols=(0,))
        tb.move_to([0, 0.4, 0])
        self.at("Here is the full table")
        self.play(FadeIn(tb[0]), *[FadeIn(tb[i].cells[0]) for i in (1, 2, 3)], *[FadeIn(tb[i][1]) for i in (1, 2, 3)],
                  run_time=0.8)
        for cue, r, c in [("A strict fail goes", 1, 1), ("A strict cannot verify", 1, 2), ("A soft fail keeps", 2, 1),
                          ("A soft cannot verify", 2, 2)]:
            self.at(cue)
            self.play(FadeIn(tb[r].cells[c], shift=LEFT * 0.15), run_time=0.5)
        self.at("A watch rule only logs")
        self.play(FadeIn(tb[3].cells[1]), FadeIn(tb[3].cells[2]), run_time=0.5)
        self.at("The harness accepts an output only")
        acc = T("accept only when each strict rule gives pass", size=24, color=C["pass"]).next_to(tb, DOWN, buff=0.5)
        self.play(FadeIn(acc), run_time=0.6)
        self.at("It never turns cannot verify")
        nv = T("cannot verify: never a silent accept, never a silent reject", size=22, color=C["cv"])
        nv.next_to(acc, DOWN, buff=0.25)
        self.play(FadeIn(nv), run_time=0.6)
        self.at("This table is the design")
        c = chip("DESIGN", "DESIGN: the judge step (enforce.binding)").to_corner(UR, buff=0.5)
        self.play(FadeIn(c), run_time=0.5)
        self.at("No code applies it yet")
        self.play(pulse(c, C["cv"]), run_time=0.9)
        self.finish()


class VerdictRows(HScene):
    key = "35_verdict_rows"

    def construct(self):
        self.add(heading(PART, "one verdict row"))
        fields = [("run_id", FG), ("rule_id", C["rule"]), ("rule_version", C["rule"]), ("rule_hash", C["rule"]),
                  ("binding", FG), ("target", FG), ("verdict", C["pass"]), ("decider", C["judge"]),
                  ("reason", FG), ("evidence", FG), ("created_at", MUTED)]
        card = code_card(fields, size=22, title="harness.verdicts (one row)", color=C["store"], gap=0.06)
        card.move_to([-3.0, -0.3, 0])
        L = card.lines
        self.at("It holds the rule")
        self.play(FadeIn(card.rect), FadeIn(card[2]), FadeIn(L[0]), run_time=0.5)
        self.play(LaggedStart(*[FadeIn(L[i]) for i in range(1, 8)], lag_ratio=0.25), run_time=2.2)
        self.at("It also holds a reason")
        self.play(FadeIn(L[8]), FadeIn(L[9]), FadeIn(L[10]), run_time=0.6)
        self.at("So a later reader can ask")
        q = T("why did the graph store accept this output?", size=24, color=FG).move_to([3.2, 0.6, 0])
        self.play(FadeIn(q), run_time=0.6)
        self.at("The table exists in code")
        lk = tag("append-only", C["store"], size=20).next_to(q, DOWN, buff=0.4)
        c = chip("BUILT", "BUILT: the table").next_to(lk, DOWN, buff=0.25)
        self.play(FadeIn(lk), FadeIn(c), run_time=0.6)
        self.finish()
