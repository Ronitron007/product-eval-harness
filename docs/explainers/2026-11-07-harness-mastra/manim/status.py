"""Part part.status: what is built today (main at cacc262)."""
from manim import *

from style import *
from timing import HScene

PART = "part.status: what is built today"

RULES = [
    ("Code never decides a grade or a match.", "rules.harness"),
    ("Cannot verify is never a pass and never a fail.", "enforce.verdicts"),
    ("A child rule never loosens an inherited rule.", "graph.scope"),
    ("One version number always means the same words.", "rule_record.lock"),
    ("Rows only grow.", "store.safety"),
    ("Judges run only after the code checks pass.", "enforce.deciders"),
    ("A watch rule never steers a draft.", "compile.instructions"),
    ("A paid run needs a yes: prompt, model, cost.", "rules.gates"),
    ("Rohan approves each rule change.", "enforce.compile"),
]


class DesignRulesTable(HScene):
    key = "36_design_rules_table"

    def construct(self):
        self.add(heading(PART, "the rules of the whole design"))
        tb = table(["rule", "source"], [[r, (n, C["rule"])] for r, n in RULES], [8.4, 3.8], size=20,
                   mono_cols=(1,))
        tb.move_to([0, -0.35, 0])
        self.at("Here they are on one table")
        self.play(FadeIn(tb[0]), run_time=0.6)
        cues = ["Code never decides", "Cannot verify is never", "A child rule never loosens", "One version number",
                "Rows only grow", "Judges run only after", "A watch rule never steers", "A paid run needs",
                "Rohan approves each rule change"]
        for i, cue in enumerate(cues):
            self.at(cue)
            self.play(FadeIn(tb[i + 1], shift=UP * 0.1), run_time=0.5)
        self.finish()


BUILT = ["rules", "compiler", "instructions", "schema", "scorers", "rule-set hash", "decode", "code", "verdicts",
         "store", "mastra"]


def recolor(part, color):
    """Animations that turn a part of the outline to one status colour (one animation per shape)."""
    skip = {id(x) for x in part.label.get_family()} if hasattr(part, "label") else set()
    fill = 0.14 if color != STATUS["DESIGN"] else 0.04
    anims = []
    for sm in part.family_members_with_points():
        if id(sm) in skip or isinstance(sm, Text):
            continue
        if sm is getattr(part, "rect", None):
            anims.append(sm.animate.set_stroke(color=color).set_fill(color, fill))
        elif sm.get_stroke_width() > 0:
            anims.append(sm.animate.set_stroke(color=color))
    return anims


class BuiltStatus(HScene):
    key = "37_built_status"

    def construct(self):
        self.add(heading(PART, "what exists today"))
        od = OutlineDiagram().shift(DOWN * 0.25)
        self.play(FadeIn(od), run_time=0.8)
        key = legend_row([(STATUS["BUILT"], "BUILT: code on main at cacc262"), (STATUS["DESIGN"], "DESIGN only")])
        key.to_corner(UR, buff=0.45)
        self.at("Four units of the plan exist")
        self.play(FadeIn(key), run_time=0.5)
        self.at("They are the starter project")
        g = [p for k, p in od.parts.items() if k in BUILT]
        self.play(*[a for p in g for a in recolor(p, STATUS["BUILT"])], run_time=1.2)
        units = VGroup(*[chip("BUILT", u) for u in ("plan.scaffold", "plan.rule_record", "plan.graph_store",
                                                    "plan.compiler")]).arrange(RIGHT, buff=0.25)
        units.to_edge(DOWN, buff=0.25).to_edge(LEFT, buff=0.3)
        self.play(Level(od.parts["change"], 0.15), Level(od.parts["outside"], 0.0),
                  Level(od.links["change_rules"], 0.15), LaggedStart(*[FadeIn(u) for u in units], lag_ratio=0.2),
                  run_time=1.0)

        self.at("Everything else is a design")
        d = [p for k, p in od.parts.items() if k not in BUILT and k not in ("change", "outside")]
        self.play(*[a for p in d for a in recolor(p, STATUS["DESIGN"])], run_time=1.0)
        self.at("That includes the judge step")
        self.play(FadeOut(units), run_time=0.4)
        design = ["judge step", "stage workflow", "repair loop", "person step", "tool server", "research tools",
                  "four stages", "change process", "improvement loop", "golden set sync"]
        dchips = VGroup(*[chip("DESIGN", x) for x in design])
        r1 = VGroup(*dchips[:4]).arrange(RIGHT, buff=0.15)
        r2 = VGroup(*dchips[4:7]).arrange(RIGHT, buff=0.15)
        r3 = VGroup(*dchips[7:]).arrange(RIGHT, buff=0.15)
        rows = VGroup(r1, r2, r3).arrange(DOWN, buff=0.08, aligned_edge=LEFT).to_edge(DOWN, buff=0.06).to_edge(LEFT, buff=0.3)
        self.play(Level(od.parts["change"], 0), Level(od.links["change_rules"], 0), FadeIn(r1), run_time=0.7)
        self.at("It also includes the tool server")
        self.play(FadeIn(r2), run_time=0.6)
        self.at("It also includes the change process")
        self.play(FadeIn(r3[:2]), run_time=0.5)
        self.at("The golden set sync")
        self.play(FadeIn(r3[2]), run_time=0.5)

        self.at("Two more facts matter")
        self.play(FadeOut(rows), Level(od, 0.15), run_time=0.6)
        f1 = panel(para(["rules/ in the repo: 0 rule files"], size=24), color=C["rule"])
        f2 = panel(para(["live migration applied: 45 tables in the parts harness and mastra,",
                         "row level security on each table",
                         "(verified 2026-11-02, read-only SQL)"], size=22), color=C["pass"])
        stale = T("the harness docs still say: not applied (out of date)", size=20, color=C["fail"])
        VGroup(f1, f2, stale).arrange(DOWN, buff=0.4).move_to([0, -0.4, 0])
        self.at("The rules folder holds no rule yet")
        self.play(FadeIn(f1), run_time=0.6)
        self.at("The harness docs still say")
        self.play(FadeIn(stale), run_time=0.6)
        self.at("That is out of date")
        self.play(Create(strike(stale, color=C["fail"], sw=3)), run_time=0.5)
        self.at("The migration is on the live")
        self.play(FadeIn(f2.rect), FadeIn(f2[1][0]), run_time=0.7)
        self.at("Each table has row level security")
        self.play(FadeIn(f2[1][1]), run_time=0.5)
        self.at("A read-only check confirmed")
        self.play(FadeIn(f2[1][2]), run_time=0.5)
        self.finish()
