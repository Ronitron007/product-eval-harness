"""Part part.goal: the goal and the outline."""
from manim import *

from style import *
from timing import HScene

PART = "part.goal: the goal and the outline"


class GoalProblem(HScene):
    key = "01_goal_problem"

    def construct(self):
        title = T("The product eval harness", size=48, weight="BOLD")
        sub = T("what Mastra gives us, and how the design uses it", size=28, color=MUTED)
        card = VGroup(title, sub).arrange(DOWN, buff=0.3)
        self.play(FadeIn(card, shift=UP * 0.2), run_time=1.2)
        self.at("Today, a model decides")
        self.play(FadeOut(card), FadeIn(h := heading(PART, "the problem")), run_time=0.8)

        cloud = box("meta instructions", MUTED, w=3.0, h=1.0, fill=0.05)
        cloud.rect.set_stroke(opacity=0.8)
        llm = box("LLM", C["model"], w=1.6, h=1.0)
        out = box("rules of an evaluation", MUTED, w=3.4, h=1.0, fill=0.03)
        out_d = DashedVMobject(out.rect, num_dashes=40)
        left = VGroup(cloud, llm, out).arrange(DOWN, buff=0.55).move_to([-3.6, -0.5, 0])
        out_d.move_to(out.rect)
        a1, a2 = link(cloud, llm), link(llm, out)
        self.play(FadeIn(cloud), run_time=0.7)
        self.play(GrowArrow(a1), FadeIn(llm), run_time=0.7)
        self.play(GrowArrow(a2), FadeIn(out_d), FadeIn(out.label), run_time=0.7)
        self.at("No code and no judge")
        nocheck = T("no check", size=24, color=C["fail"]).next_to(out, RIGHT, buff=0.3)
        q = cross(Square(0.36), sw=5).next_to(nocheck, UP, buff=0.12)
        self.play(FadeIn(nocheck), Create(q), run_time=0.8)
        self.at("Rohan stated this problem")
        foot = tag("graph.problem, Rohan, 2026-10-24").to_edge(DOWN, buff=0.35)
        self.play(FadeIn(foot), run_time=0.6)

        self.at("The goal of the harness is different")
        divider = DashedLine([0.4, 2.0, 0], [0.4, -2.9, 0], color=FAINT)
        names = ["units.label_unit", "quotes.from_label", "attributes.is_product"]
        cards = VGroup()
        for n in names:
            cb = Square(0.32, color=C["pass"], stroke_width=3)
            tk = tick(s=0.12).move_to(cb)
            row = VGroup(M(n, size=20), VGroup(cb, tk)).arrange(RIGHT, buff=0.4)
            cards.add(box_around(row, C["rule"]))
        cards.arrange(DOWN, buff=0.28).move_to([3.7, 0.0, 0])
        cap = T("each rule: an object with a check", size=24, color=C["rule"]).next_to(cards, DOWN, buff=0.35)
        self.play(Create(divider), LaggedStart(*[FadeIn(c, shift=LEFT * 0.3) for c in cards], lag_ratio=0.3),
                  run_time=1.6)
        self.play(FadeIn(cap), run_time=0.6)
        self.at("Each rule says where it applies")
        where = tag("scope: where in the category tree", C["tree"]).next_to(cards, UP, buff=0.35)
        self.play(FadeIn(where), run_time=0.6)
        self.at("For each rule, the design knows")
        enforce = tag("binding: what a fail does", FG).next_to(where, UP, buff=0.15)
        self.play(FadeIn(enforce), run_time=0.6)
        self.at("This video walks that design")
        self.play(pulse(cards, C["rule"]), run_time=1.2)
        self.finish()


def box_around(content, color, pad=0.22):
    rect = RoundedRectangle(corner_radius=0.1, width=content.width + 2 * pad, height=content.height + 2 * pad,
                            color=color, stroke_width=3).set_fill(color, 0.1).move_to(content)
    return VGroup(rect, content)


class GoalEvalWords(HScene):
    key = "02_goal_eval_words"

    def construct(self):
        self.add(heading(PART, "two words: product evaluation and eval"))
        pe = box("product evaluation", C["rule"], w=5.4, h=1.5, size=28, sub="grades a product, such as a sunscreen",
                 sub_size=22)
        ev = box("eval", C["code"], w=5.4, h=1.5, size=28, sub="measures model output over many inputs",
                 sub_size=22)
        VGroup(pe, ev).arrange(RIGHT, buff=0.9).move_to(UP * 0.9)
        self.play(FadeIn(pe, shift=UP * 0.2), run_time=0.8)
        self.at("An eval is a different thing")
        self.play(FadeIn(ev, shift=UP * 0.2), run_time=0.8)

        self.at("Think of an eval as a unit test")
        unit = T("like a unit test, for a program that answers in a new way each time", size=22, color=MUTED)
        unit.next_to(VGroup(pe, ev), DOWN, buff=0.45)
        self.play(FadeIn(unit), run_time=0.7)
        self.at("So you run it on many inputs")
        cells = VGroup()
        for i in range(40):
            ok = i not in (11, 29)
            sq = Square(0.24, stroke_width=1.5, color=C["pass"] if ok else C["fail"]).set_fill(
                C["pass"] if ok else C["fail"], 0.5)
            cells.add(sq)
        cells.arrange(RIGHT, buff=0.06).next_to(unit, DOWN, buff=0.45)
        tally = T("40 runs, 38 pass (a picture, not real numbers)", size=20, color=MUTED).next_to(cells, DOWN, buff=0.2)
        self.play(LaggedStart(*[FadeIn(c) for c in cells], lag_ratio=0.05), run_time=1.8)
        self.play(FadeIn(tally), run_time=0.5)

        self.at("To count, you need an answer key")
        self.play(FadeOut(VGroup(pe, ev, unit, cells, tally)), run_time=0.6)
        tb = table(["input", "answer a person confirmed"],
                   [[("label: Zinc oxide 200 mg", FG), ("unit: mg", C["pass"])]],
                   [5.2, 4.6], size=24, mono_cols=(0, 1))
        tb.move_to(UP * 1.2)
        gold = T("golden set = the answer key", size=26, color=C["rule"]).next_to(tb, UP, buff=0.35)
        self.play(FadeIn(gold), FadeIn(tb[0]), run_time=0.8)
        self.at("A trusted person wrote")
        stamp = person_stamp().next_to(tb, RIGHT, buff=0.2)
        self.play(FadeIn(tb[1]), FadeIn(stamp, scale=1.3), run_time=0.9)
        self.at("A saved output of a model is not")
        saved = box("saved model output", C["model"], w=3.6, h=0.8, fill=0.06)
        note = T("not golden until a person checks it", size=22, color=MUTED)
        grp = VGroup(saved, note).arrange(RIGHT, buff=0.4).next_to(tb, DOWN, buff=0.7)
        st = strike(saved.label)
        self.play(FadeIn(saved), run_time=0.5)
        self.play(Create(st), FadeIn(note), run_time=0.8)

        self.at("Here is a tiny example")
        self.play(FadeOut(VGroup(saved, note, st)), run_time=0.5)
        self.play(Indicate(tb[1].cells[0], color=C["rule"]), run_time=1.0)
        self.at("The golden example says")
        self.play(Indicate(tb[1].cells[1], color=C["pass"]), run_time=1.0)
        self.at("The eval asks if the model")
        model_out = code_card([("model wrote:  unit: mg", FG)], size=22, color=C["model"])
        q = T("same as the key?", size=22, color=MUTED)
        res = VGroup(model_out, q, tick(s=0.2)).arrange(RIGHT, buff=0.35).next_to(tb, DOWN, buff=0.7)
        self.play(FadeIn(res[0]), run_time=0.6)
        self.play(FadeIn(res[1]), Create(res[2]), run_time=0.8)

        self.at("In this harness, each rule carries")
        self.play(FadeOut(VGroup(tb, gold, stamp, res)), run_time=0.6)
        rule = box("units.label_unit", C["rule"], w=4.4, h=1.0, mono=True, size=24)
        drawer = code_card([("examples:", MUTED), ("  mg  -> pass", C["pass"]), ("  IU  -> fail", C["fail"])],
                           size=22, color=C["rule"])
        VGroup(rule, drawer).arrange(DOWN, buff=0.12).move_to(DOWN * 0.2)
        self.play(FadeIn(rule), run_time=0.6)
        self.play(FadeIn(drawer, shift=DOWN * 0.3), run_time=0.8)
        self.at("So each rule can test itself")
        self.play(pulse(drawer, C["rule"]), run_time=1.2)
        self.finish()


def person_stamp():
    head = Circle(0.16, color=C["person"], stroke_width=3)
    body = Arc(radius=0.3, start_angle=PI * 0.15, angle=PI * 0.7, color=C["person"], stroke_width=3)
    body.next_to(head, DOWN, buff=0.04)
    lab = T("a person", size=18, color=C["person"])
    return VGroup(VGroup(head, body), lab).arrange(DOWN, buff=0.08)


PARTS = [
    "the parts of Mastra",
    "the category tree and its stages",
    "rules written as data",
    "the compiler",
    "one stage run",
    "the three-way verdict and the bindings",
    "what is built today",
]


class GoalOutline(HScene):
    key = "03_goal_outline"

    def construct(self):
        h = heading(PART, "the whole path, on one picture")
        self.add(h)
        od = OutlineDiagram()
        P, L = od.parts, od.links
        od.remove(P["mastra"])
        od.shift(DOWN * 0.25)
        self.wait(0.4)
        self.at("On the left, people write")
        self.play(FadeIn(P["rules"]), run_time=0.8)
        self.at("A program reads the rules")
        self.play(GrowArrow(L["rules_compiler"]), FadeIn(P["compiler"]), FadeIn(P["tree"]),
                  GrowArrow(L["tree_compiler"]), run_time=1.0)
        self.at("It turns them into")
        outs = od.groups["compiler_outputs"]
        self.play(LaggedStart(*[AnimationGroup(GrowArrow(L["compiler_" + o]), FadeIn(P[o])) for o in outs],
                              lag_ratio=0.3), run_time=1.6)
        self.at("A model writes a draft")
        self.play(*[GrowArrow(L[o + "_drafter"]) for o in outs], FadeIn(P["drafter"]), run_time=1.0)
        self.at("Checks in plain code run first")
        self.play(Create(L["drafter_decode"]), FadeIn(P["decode"]), run_time=1.0)
        self.play(GrowArrow(L["decode_code"]), FadeIn(P["code"]), run_time=0.7)
        self.at("Model judges run next")
        self.play(GrowArrow(L["code_judges"]), FadeIn(P["judges"]), run_time=0.8)
        self.at("Each check writes a result row")
        self.play(GrowArrow(L["judges_verdicts"]), FadeIn(P["verdicts"]), run_time=0.8)
        self.at("Then the draft goes one of three ways")
        self.play(GrowArrow(L["verdicts_bindings"]), FadeIn(P["bindings"]), run_time=0.8)
        self.at("It goes back to the model")
        self.play(GrowArrow(L["bindings_repair"]), FadeIn(P["repair"]), Create(L["repair_drafter"]), run_time=1.0)
        self.at("Or a person decides")
        self.play(GrowArrow(L["bindings_person"]), FadeIn(P["person"]), run_time=0.7)
        self.at("Or the harness accepts it")
        self.play(GrowArrow(L["bindings_accept"]), FadeIn(P["accept"]), GrowArrow(L["accept_store"]),
                  FadeIn(P["store"]), run_time=1.0)
        self.at("A rule changes only through")
        self.play(FadeIn(P["change"]), Create(L["change_rules"]), run_time=1.0)
        self.at("This video does not walk")
        self.play(FadeIn(P["outside"]), run_time=0.6)

        self.at("Seven parts follow")
        items = para(PARTS, size=26, gap=0.12)
        card = panel(items, color=EDGE, pad=0.4, title="seven parts")
        card.move_to(DOWN * 0.3)
        self.play(Level(od, 0.15), FadeIn(card.rect), FadeIn(card[2]),
                  LaggedStart(*[FadeIn(i, shift=RIGHT * 0.2) for i in items], lag_ratio=0.2), run_time=1.3)
        self.at("Most of this path is a design")
        self.play(Indicate(items[-1], color=C["pass"]), run_time=1.0)
        self.finish()
