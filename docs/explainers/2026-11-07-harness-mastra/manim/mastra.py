"""Part part.mastra: the parts of Mastra."""
from manim import *

from style import *
from timing import HScene

PART = "part.mastra: the parts of Mastra"


def step_box(name, w=2.1):
    return box(name, C["mastra"], w=w, h=0.8, size=22)


def chain(names, y=0.0, gap=1.1, labels=".then()"):
    boxes = VGroup(*[step_box(n) for n in names]).arrange(RIGHT, buff=gap).move_to([0, y, 0])
    arrows = VGroup(*[link(a, b) for a, b in zip(boxes[:-1], boxes[1:])])
    labs = VGroup(*[M(labels, size=18, color=MUTED).next_to(a, UP, buff=0.08) for a in arrows]) if labels else VGroup()
    return boxes, arrows, labs


class MastraStepWorkflow(HScene):
    key = "04_mastra_step_workflow"

    def construct(self):
        h = heading(PART, "step and workflow")
        self.add(h)
        od = outline_beat(self, "mastra", "run")
        self.at("Mastra is a TypeScript framework")
        cap = T("Mastra: a TypeScript framework for agents and the code around them", size=20, color=C["mastra"])
        cap.to_edge(DOWN, buff=0.25)
        self.play(Level(od.parts["change"], 0), Level(od.parts["outside"], 0), Level(od.links["change_rules"], 0),
                  FadeIn(cap), run_time=0.7)

        self.at("The first part is the step")
        self.play(FadeOut(od), FadeOut(cap), run_time=0.6)
        st = step_box("step", w=2.6).move_to(UP * 0.6)
        name = tag("id: 'double'", C["mastra"]).next_to(st, UP, buff=0.2)
        a_in = Arrow(st.get_left() + LEFT * 3.0, st.get_left(), buff=0.05, color=MUTED, stroke_width=3)
        a_out = Arrow(st.get_right(), st.get_right() + RIGHT * 3.0, buff=0.05, color=MUTED, stroke_width=3)
        l_in = M("inputSchema (Zod)", size=20, color=MUTED).next_to(a_in, DOWN, buff=0.12)
        l_out = M("outputSchema (Zod)", size=20, color=MUTED).next_to(a_out, DOWN, buff=0.12)
        self.play(FadeIn(st), run_time=0.7)
        self.at("A step is a function with a typed contract")
        mcp = T("like a tool on an MCP server: a typed contract", size=22, color=MUTED).next_to(st, DOWN, buff=1.0)
        self.play(FadeIn(mcp), run_time=0.7)
        self.at("It has a name")
        self.play(FadeIn(name), run_time=0.5)
        self.play(GrowArrow(a_in), FadeIn(l_in), run_time=0.7)
        self.play(GrowArrow(a_out), FadeIn(l_out), run_time=0.7)

        self.at("The second part is the workflow")
        one = VGroup(st, name, a_in, a_out, l_in, l_out, mcp)
        self.play(FadeOut(one), run_time=0.5)
        boxes, arrows, labs = chain(["get context", "draft", "check"], y=1.2, gap=1.5)
        wf = T("workflow", size=24, color=C["mastra"], weight="BOLD").next_to(boxes, UP, buff=0.55)
        self.play(FadeIn(wf), LaggedStart(*[FadeIn(b) for b in boxes], lag_ratio=0.3), run_time=1.2)
        self.at("A workflow is a chain")
        self.play(*[GrowArrow(a) for a in arrows], FadeIn(labs), run_time=0.9)
        self.at("The model never picks")
        fixed = T("code fixes the order; the model never picks the next step", size=22, color=MUTED)
        fixed.next_to(boxes, DOWN, buff=0.75)
        self.play(FadeIn(fixed), run_time=0.7)
        self.at("The output of each step is the input")
        agree = VGroup(*[T("out = next in", size=18, color=C["code"]).next_to(a, DOWN, buff=0.12) for a in arrows])
        self.play(FadeIn(agree), *[a.animate.set_color(C["code"]) for a in arrows], run_time=0.8)

        self.at("Compare this with an agent")
        left = VGroup(wf, boxes, arrows, labs, agree)
        self.play(FadeOut(fixed), run_time=0.5)
        ag = box("agent", C["model"], w=2.2, h=1.0, size=24).move_to([-3.2, -1.9, 0])
        loop = CurvedArrow(ag.get_right() + UP * 0.3, ag.get_right() + DOWN * 0.3, angle=-PI * 1.3, color=C["model"])
        self.play(FadeIn(ag), run_time=0.6)
        self.at("An agent picks its own next move")
        dec = T("agent: the model decides the next move", size=22, color=C["model"]).next_to(ag, RIGHT, buff=1.0)
        self.play(Create(loop), FadeIn(dec), run_time=0.9)
        self.at("A workflow is a fixed path")
        fx = T("workflow: a fixed path; the model only fills the steps", size=22, color=C["mastra"])
        fx.move_to([0, -0.15, 0])
        self.play(FadeIn(fx), run_time=0.7)

        self.at("In this repo, one test runs")
        self.play(FadeOut(VGroup(left, ag, loop, dec, fx)), run_time=0.5)
        code = code_card([
            "const Count = z.object({ n: z.number() })",
            "const double = createStep({",
            "  id: 'double',",
            "  inputSchema: Count,",
            "  outputSchema: Count,",
            ("  execute: async ({ inputData }) => ({ n: inputData.n * 2 }),", C["mastra"]),
            "})",
            "const smoke = createWorkflow({ id: 'smoke', inputSchema: Count, outputSchema: Count })",
            "  .then(double).commit()",
            ("run.start({ inputData: { n: 21 } })   ->   { n: 42 }", C["pass"]),
        ], size=18, title="tests/harness.test.ts (real)")
        code.move_to(DOWN * 0.15)
        self.play(FadeIn(code.rect), FadeIn(code[2]), run_time=0.5)
        self.play(LaggedStart(*[FadeIn(l) for l in code.lines[:9]], lag_ratio=0.15), run_time=1.8)
        self.at("Its one step doubles")
        self.play(FadeIn(code.lines[9]), run_time=0.7)
        self.at("That test exists in code today")
        c1 = chip("BUILT", "BUILT: this test").next_to(code, DOWN, buff=0.3).shift(LEFT * 2)
        self.play(FadeIn(c1), run_time=0.5)
        self.at("The real workflows of the harness")
        c2 = chip("DESIGN", "DESIGN: the stage workflows").next_to(c1, RIGHT, buff=0.5)
        self.play(FadeIn(c2), run_time=0.5)
        self.finish()


def pause_bars(mob, color=C["person"]):
    b = VGroup(*[Rectangle(width=0.1, height=0.36, stroke_width=0).set_fill(color, 1) for _ in range(2)])
    b.arrange(RIGHT, buff=0.1).next_to(mob, UP, buff=0.12)
    return b


class MastraSuspendResume(HScene):
    key = "05_mastra_suspend_resume"

    def construct(self):
        self.add(heading(PART, "suspend and resume"))
        boxes, arrows, labs = chain(["context", "draft", "person"], y=1.4, labels=None)
        boxes[2].rect.set_color(C["person"]).set_fill(C["person"], 0.14)
        self.play(LaggedStart(*[FadeIn(b) for b in boxes], lag_ratio=0.3), *[GrowArrow(a) for a in arrows],
                  run_time=1.2)
        self.at("An await in memory cannot")
        proc = code_card([("await reviewer()   // in memory", FG)], size=20, title="one process")
        proc.move_to([0, -0.6, 0])
        self.play(FadeIn(proc), run_time=0.6)
        self.at("The process can stop or restart")
        x = cross(proc.rect, sw=5)
        gone = T("process stops: the await is gone", size=22, color=C["fail"]).next_to(proc, DOWN, buff=0.3)
        self.play(Create(x), FadeIn(gone), run_time=0.8)

        self.at("So Mastra writes the state")
        self.play(FadeOut(VGroup(proc, x, gone)), run_time=0.4)
        db = cylinder("Mastra storage on Postgres", w=4.4, h=1.1, size=22, sub="schema mastra").move_to([-2.8, -1.4, 0])
        js = code_card(["{ runId, step, status, output }"], size=20, title="each run, as JSON")
        js.next_to(db, RIGHT, buff=0.6)
        down = Arrow(boxes[1].get_bottom(), db.get_top() + UP * 0.1, buff=0.1, color=MUTED, stroke_width=3)
        self.play(FadeIn(db), GrowArrow(down), run_time=0.8)
        self.play(FadeIn(js), run_time=0.6)
        self.at("A step can suspend")
        bars = pause_bars(boxes[2])
        self.play(FadeIn(bars), Level(boxes[2], 0.6), run_time=0.6)
        self.at("Suspend means save the run")
        sus = T("suspend = save the run, stop, ask for input", size=22, color=C["person"])
        sus.next_to(boxes, DOWN, buff=0.35)
        self.play(FadeIn(sus), run_time=0.6)
        self.at("Later, any process can resume")
        any_p = tag("any process, later", FG).next_to(js, DOWN, buff=0.45)
        up = Arrow(any_p.get_top(), boxes[2].get_bottom(), buff=0.1, color=C["person"], stroke_width=3)
        res = M("resume", size=20, color=C["person"]).next_to(up, RIGHT, buff=0.1)
        self.play(FadeIn(any_p), GrowArrow(up), FadeIn(res), run_time=0.9)

        self.at("Think of a video game")
        game = panel(para(["save at a hard level,", "return tomorrow:", "the save file holds the run,",
                           "not the live process"], size=22), color=MUTED, title="like a video game")
        game.to_edge(RIGHT, buff=0.4).shift(DOWN * 1.3)
        self.play(FadeOut(VGroup(any_p, up, res, js)), FadeIn(game), run_time=0.8)

        self.at("Here is the example from the design")
        self.play(FadeOut(VGroup(game, db, down, sus)), run_time=0.5)
        rev = panel(para(["open results of the draft:", "  quotes.from_label  fail", "  units.mass_only  fail"],
                         size=20), color=C["person"], title="reviewer")
        rev.move_to([3.6, -1.0, 0])
        self.at("A person step suspends the run")
        a1 = Arrow(boxes[2].get_bottom(), rev.get_top(), buff=0.1, color=C["person"], stroke_width=3)
        self.play(GrowArrow(a1), FadeIn(rev), run_time=0.9)
        self.at("A reviewer reads them")
        rcode = code_card([("run.resume({ step, resumeData: { approved: true } })", C["person"])], size=20)
        rcode.move_to([-2.4, -1.0, 0])
        self.play(FadeIn(rcode), run_time=0.7)
        self.at("A reject ends the run cleanly")
        bail = code_card([("reject  ->  bail()  ends the run cleanly, not as an error", MUTED)], size=20)
        bail.next_to(rcode, DOWN, buff=0.3).align_to(rcode, LEFT)
        self.play(FadeIn(bail), run_time=0.7)

        self.at("One trap exists")
        self.play(FadeOut(VGroup(rev, a1, rcode, bail)), run_time=0.5)
        body = code_card([
            ("step person:", MUTED),
            ("  code before the suspend", C["fail"]),
            "  suspend(open results)",
            "  code after the resume",
        ], size=22, title="the step body (a picture, not real code)")
        body.move_to([-3.0, -1.3, 0])
        self.play(FadeIn(body), run_time=0.7)
        self.at("On resume, the step runs again")
        top = Arrow(body.lines[1].get_right() + RIGHT * 2.6, body.lines[1].get_right() + RIGHT * 0.3, buff=0,
                    color=C["fail"], stroke_width=4)
        txt = T("resume starts here again", size=20, color=C["fail"]).next_to(top, RIGHT, buff=0.1)
        self.play(GrowArrow(top), FadeIn(txt), run_time=0.8)
        self.at("So code before the suspend")
        twice = T("runs two times", size=24, color=C["fail"], weight="BOLD").next_to(body, DOWN, buff=0.3)
        self.play(FadeIn(twice), run_time=0.6)

        self.at("In this repo, Mastra storage")
        c1 = chip("BUILT", "BUILT: Mastra storage on Postgres")
        c2 = chip("DESIGN", "DESIGN: the person step")
        VGroup(c1, c2).arrange(RIGHT, buff=0.5).to_edge(DOWN, buff=0.3)
        self.play(FadeIn(c1), run_time=0.5)
        self.at("The person step is a design")
        self.play(FadeIn(c2), run_time=0.5)
        self.finish()


class MastraScorer(HScene):
    key = "06_mastra_scorer"

    def construct(self):
        self.add(heading(PART, "the scorer"))
        mod = tag("module: @mastra/core/evals", C["mastra"]).to_corner(UR, buff=0.5)
        self.at("Mastra keeps its scorers")
        self.play(FadeIn(mod), run_time=0.6)
        self.at("A scorer takes one output")
        out = box("one run output", C["model"], w=2.8)
        sc = box("scorer", C["mastra"], w=2.0)
        num = box("0 .. 1", FG, w=1.6, mono=True)
        top = VGroup(out, sc, num).arrange(RIGHT, buff=1.0).move_to(UP * 1.7)
        ar = VGroup(link(out, sc), link(sc, num))
        self.play(FadeIn(out), FadeIn(sc), FadeIn(num), *[GrowArrow(a) for a in ar], run_time=1.0)

        self.at("A scorer is a pipeline")
        names = ["preprocess", "analyze", "generateScore", "generateReason"]
        jobs = ["picks the items", "a result per item", "turns results\ninto a number", "writes a reason"]
        steps = VGroup(*[box(n, C["mastra"], w=2.75, h=0.7, size=20, mono=True) for n in names])
        steps.arrange(RIGHT, buff=0.45).move_to(DOWN * 0.1)
        st_ar = VGroup(*[link(a, b, sw=2, tip=0.12) for a, b in zip(steps[:-1], steps[1:])])
        self.play(Level(top, 0.35), Level(ar, 0.35), run_time=0.5)
        self.at("Think of a form with four boxes")
        self.play(LaggedStart(*[FadeIn(s) for s in steps], lag_ratio=0.25), *[GrowArrow(a) for a in st_ar],
                  run_time=1.4)
        descs = VGroup()
        for s, j in zip(steps, jobs):
            d = para(j.split("\n"), size=20, color=MUTED, align=ORIGIN, gap=0.04)
            d.next_to(s, DOWN, buff=0.25)
            descs.add(d)
        for frag, i in [("The first box picks", 0), ("The second box gives", 1), ("The third box turns", 2),
                        ("The fourth box writes", 3)]:
            self.at(frag)
            self.play(FadeIn(descs[i], shift=UP * 0.1), steps[i].rect.animate.set_stroke(width=5), run_time=0.6)
        self.at("Only the third box must exist")
        req = tag("required", C["pass"]).next_to(steps[2], UP, buff=0.2)
        opt = VGroup(*[tag("optional", MUTED).next_to(steps[i], UP, buff=0.2) for i in (0, 1, 3)])
        self.play(FadeIn(req), FadeIn(opt), run_time=0.7)

        self.at("Each box is a plain function or a prompt")
        kinds = VGroup(chip("REAL", "function: free"), chip("ILLUSTRATIVE", "prompt: calls a judge model"))
        kinds[1][0].set_color(C["judge"]).set_fill(C["judge"], 0.1)
        kinds[1][1].set_color(C["judge"])
        kinds.arrange(RIGHT, buff=0.6).next_to(descs, DOWN, buff=0.45)
        self.play(FadeIn(kinds[0]), run_time=0.5)
        self.at("A prompt box calls a judge model")
        self.play(FadeIn(kinds[1]), run_time=0.5)
        self.at("So a scorer of plain functions")
        never = T("all boxes functions  ->  no model call", size=22, color=C["code"]).next_to(kinds, DOWN, buff=0.3)
        self.play(FadeIn(never), run_time=0.6)

        self.at("In this repo, the code makes one Mastra scorer")
        self.play(FadeOut(VGroup(top, ar, steps, st_ar, descs, req, opt, kinds, never)), run_time=0.5)
        code = code_card([
            ("createScorer({ id: 'quotes.from_label@1', description: rule.statement })", FG),
            "  .preprocess(({ run }) => allTargets(run.output, fields))",
            "  .analyze(({ run, results }) => results.preprocessStepResult.map(...))",
            "  .generateScore(({ results }) =>",
            "      results.analyzeStepResult.every(o => o.verdict === 'pass') ? 1 : 0)",
        ], size=18, title="src/compiler/scorers.ts (real, shortened)")
        code.move_to(UP * 0.2)
        self.play(FadeIn(code), run_time=0.8)
        self.at("Its name is the rule name")
        idt = VGroup(M("quotes.from_label", size=24, color=C["rule"]), M("@", size=24, color=MUTED),
                     M("1", size=24, color=C["rule"])).arrange(RIGHT, buff=0.05)
        lab = T("rule name  @  version", size=20, color=MUTED)
        VGroup(idt, lab).arrange(DOWN, buff=0.15).next_to(code, DOWN, buff=0.45)
        self.play(FadeIn(idt), FadeIn(lab), run_time=0.7)
        self.at("A scorer for a rule that code can decide")
        fn = T("a rule that code can decide: function boxes only", size=22, color=C["code"])
        fn.next_to(lab, DOWN, buff=0.35)
        self.play(FadeIn(fn), run_time=0.6)
        self.at("That code exists today")
        c = chip("BUILT", "BUILT: one scorer per rule").next_to(fn, DOWN, buff=0.3)
        self.play(FadeIn(c), run_time=0.5)
        self.finish()


class MastraGaps(HScene):
    key = "07_mastra_gaps"

    def construct(self):
        self.add(heading(PART, "what Mastra does not give"))
        tb = table(["the need", "Mastra gives", "the harness builds"], [
            ["rules with a version\nand a tree place", "prompt editor:\ntext versions only", ("own YAML files", C["rule"])],
            ["a three-state result", "a score is a number;\nnotScorable = does not apply,\nand gates drop it",
             ("own result rows", C["cv"])],
            ["the category tree", "no store", ("own tables", C["store"])],
            ["rules -> prompts\nand checks", "nothing", ("own program:\nthe compiler", C["compiler"])],
        ], [3.6, 5.0, 3.5], size=22)
        tb.move_to(DOWN * 0.4)
        self.play(FadeIn(tb[0]), run_time=0.6)
        beats = [
            (1, "It has no place for a rule", "So the harness keeps its rules"),
            (2, "A Mastra score is a number", "The harness keeps its own result rows"),
            (3, "Mastra has no store", "The harness keeps its own tables"),
            (4, "And nothing in Mastra turns", "The harness has its own program"),
        ]
        for i, (r, a, b) in enumerate(beats):
            row = tb[r]
            self.at(a)
            self.play(FadeIn(row.cells[0]), FadeIn(row.cells[1]), FadeIn(row[1]), run_time=0.7)
            if r == 2:
                self.at("Mastra gates drop it")
                self.play(pulse(row.cells[1], C["fail"]), run_time=1.0)
                self.at("So a rule that must pass")
                warn = T("a must-pass rule could pass in silence", size=20, color=C["fail"])
                warn.next_to(tb, DOWN, buff=0.3)
                self.play(FadeIn(warn), run_time=0.6)
            self.at(b)
            self.play(FadeIn(row.cells[2], shift=LEFT * 0.2), run_time=0.6)
        self.finish()
