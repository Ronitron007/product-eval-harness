"""Part part.run: one stage run. Rows and gate results are real worked-example output; judge answers are
from a mock model (ILLUSTRATIVE); the loop, the judge step and the person step are DESIGN."""
from manim import *

from style import *
from timing import HScene

PART = "part.run: one stage run"
LABEL = "Zinc oxide 200 mg in each gram. Free gift sachet 500 mg with each order."
DRAFT_A = '{"attributes":[{"key":"zinc_oxide","amount":200,"unit":"mcg","quote":"zinc oxide 200mg","grade":"A"}]}'
PROMPT_HASH = "d0a12d812e3e5118c54825b6c41ab2a7d16c99d3768136c7f61d45c32d52fc94"


def verdict_cell(v):
    return (v, verdict_color(v))


def legend():
    return VGroup(chip("REAL", "rows: REAL"), chip("ILLUSTRATIVE", "judge answers: ILLUSTRATIVE"),
                  chip("DESIGN", "loop: DESIGN")).arrange(RIGHT, buff=0.3)


class RunDecodeGate(HScene):
    key = "25_run_decode_gate"

    def construct(self):
        self.add(heading(PART, "the decode gate"))
        od = outline_beat(self, "run")
        self.at("This part follows one stage run")
        row = VGroup(*[od.parts[n] for n in ("drafter", "decode", "code", "judges", "verdicts", "bindings",
                                              "repair", "person", "accept")])
        self.play(pulse(row, C["model"]), run_time=1.4)
        self.at("The label text says")
        self.play(FadeOut(od), run_time=0.6)
        lab = code_card([LABEL], size=20, title="the label text (worked example)", color=C["rule"]).move_to(UP * 1.3)
        self.play(FadeIn(lab), run_time=0.7)
        self.at("Free gift sachet")
        self.play(pulse(lab.lines[0], C["rule"]), run_time=0.9)
        self.at("The scorer rows are real")
        lg = legend().next_to(lab, DOWN, buff=0.5)
        self.play(FadeIn(lg), run_time=0.7)

        self.at("What stops a broken draft")
        self.play(FadeOut(VGroup(lab, lg)), run_time=0.5)
        dr = box("draft", C["model"], w=1.8).move_to([-5.0, 1.6, 0])
        gate = box("decode gate", C["code"], w=2.6, h=0.9).move_to([-1.4, 1.6, 0])
        nxt = box("judges, graph store", MUTED, w=3.0, fill=0.04).move_to([3.2, 1.6, 0])
        a1, a2 = link(dr, gate), link(gate, nxt)
        self.play(FadeIn(dr), GrowArrow(a1), run_time=0.6)
        self.at("The decode gate does")
        self.play(FadeIn(gate), run_time=0.6)
        self.at("It parses the reply as JSON")
        steps = para(["1. parse the reply as JSON", "2. test it against the whole output schema"], size=20,
                     color=C["code"], gap=0.06).next_to(gate, DOWN, buff=0.3)
        self.play(FadeIn(steps), GrowArrow(a2), FadeIn(nxt), run_time=0.9)
        self.at("Each shape scorer checks only")
        why = panel(para(["each shape scorer sees only its own field,", "so an extra key gets no fail row"], size=20),
                    color=EDGE, title="why a gate")
        why.move_to([-2.6, -1.3, 0]).to_edge(LEFT, buff=0.4)
        self.play(FadeIn(why), run_time=0.7)
        self.at("The design also sets Mastra")
        warn = code_card([("errorStrategy: 'warn'", C["mastra"]), "keeps a raw reply that breaks the schema"], size=18,
                         title="Mastra, as the design sets it")
        warn.next_to(why, RIGHT, buff=0.4)
        self.play(FadeIn(warn), run_time=0.7)
        self.at("With no gate, that draft could reach")
        self.play(pulse(nxt, C["fail"]), run_time=1.0)

        self.at("Here is draft A")
        self.play(FadeOut(VGroup(why, warn, steps, nxt, a2, dr, a1)), gate.animate.move_to([0, 2.3, 0]), run_time=0.7)
        js = code_card([
            '{"attributes":[{',
            '  "key":"zinc_oxide", "amount":200,',
            '  "unit":"mcg",',
            '  "quote":"zinc oxide 200mg",',
            '  "grade":"A"',
            '}]}',
        ], size=18, title="draft A: the raw reply (worked example)", color=C["model"])
        js.move_to([-3.4, -0.2, 0]).to_edge(LEFT, buff=0.25)
        self.play(FadeIn(js), run_time=0.7)
        self.at("Its unit is micrograms")
        self.play(js.lines[2].animate.set_color(C["fail"]), run_time=0.5)
        self.at("Its quote is zinc oxide")
        self.play(js.lines[3].animate.set_color(C["fail"]), run_time=0.5)
        self.at("It also has an extra key")
        self.play(js.lines[4].animate.set_color(C["fail"]), run_time=0.5)

        self.at("The real gate result says no")
        res = code_card([
            ('ok: false', C["fail"]),
            'attributes[0].unit:',
            ('  Invalid input: expected "mg"', C["fail"]),
            'attributes[0].grade:',
            ('  No rule defines the key grade. Remove it.', C["fail"]),
        ], size=18, title="plan.decode (real)", color=C["code"])
        res.move_to([3.0, -0.2, 0]).to_edge(RIGHT, buff=0.25)
        self.play(FadeIn(res.rect), FadeIn(res[2]), FadeIn(res.lines[0]), run_time=0.6)
        self.at("The unit must be milligrams")
        self.play(FadeIn(res.lines[1:3]), run_time=0.6)
        self.at("No rule defines the key grade")
        self.play(FadeIn(res.lines[3:]), run_time=0.6)
        self.at("The decode gate exists in code")
        c1 = chip("BUILT", "BUILT: plan.decode").to_corner(UR, buff=0.5)
        self.play(FadeIn(c1), run_time=0.5)
        self.at("In the design, a draft that fails")
        stop = T("fails the gate: never reaches the judges or the graph store", size=20, color=MUTED)
        stop.to_edge(DOWN, buff=0.75)
        self.play(FadeIn(stop), run_time=0.6)
        self.at("It counts as a strict failure")
        sf = T("= a strict failure of the run (DESIGN)", size=20, color=C["fail"]).next_to(stop, DOWN, buff=0.12)
        self.play(FadeIn(sf), run_time=0.6)
        self.finish()


ROWS_A = [  # draft A, code scorer rows (real)
    ("attributes.amount@1", "attributes[0].amount", "pass", "200"),
    ("attributes.key@1", "attributes[0].key", "pass", '"zinc_oxide"'),
    ("attributes.list@1", "attributes", "pass", "[{...}]"),
    ("attributes.quote@1", "attributes[0].quote", "pass", '"zinc oxide 200mg"'),
    ("units.label_unit@1", "attributes[0].unit", "pass", '"mcg"'),
    ("units.mass_only@1", "attributes[0].unit", "fail", '"mcg"'),
    ("quotes.from_label@1", "attributes[0].quote", "fail", '"zinc oxide 200mg"'),
]


class RunCodeRows(HScene):
    key = "26_run_code_rows"

    def construct(self):
        self.add(heading(PART, "the code scorer rows for draft A"))
        tb = table(["rule", "target", "verdict", "evidence.quote"],
                   [[r, t, verdict_cell(v), q] for r, t, v, q in ROWS_A],
                   [3.9, 3.8, 1.7, 3.5], size=18, mono_cols=(0, 1, 2, 3))
        tb.move_to([0, 0.55, 0])
        self.play(FadeIn(tb[0]), run_time=0.6)
        self.at("Each scorer writes one row")
        self.play(LaggedStart(*[FadeIn(tb[i]) for i in (1, 2, 3, 4)], lag_ratio=0.3), run_time=1.6)
        self.at("Units label unit passes")
        self.play(FadeIn(tb[5]), run_time=0.6)
        note1 = T("skincare allows mcg", size=18, color=C["pass"]).next_to(tb[5], RIGHT, buff=0.1)
        self.at("Units mass only fails")
        self.play(FadeIn(tb[6]), run_time=0.6)
        self.at("So the parent and the child")
        br = Brace(VGroup(tb[5], tb[6]), LEFT, color=C["rule"])
        pc = T("parent, child: one row each", size=18, color=C["rule"]).next_to(br, LEFT, buff=0.1)
        if pc.get_left()[0] < -6.9:
            pc.next_to(tb, DOWN, buff=0.15).align_to(tb, LEFT)
        self.play(GrowFromCenter(br), FadeIn(pc), run_time=0.7)
        self.at("Quotes from label fails")
        self.play(FadeIn(tb[7]), run_time=0.6)
        self.at("The row carries the fix")
        fix = code_card([("reason: Copy the quote word for word from the label text,", C["fail"]),
                         ("        with the same letter case, or drop the claim.", C["fail"])], size=18,
                        title="quotes.from_label@1 row (real)")
        fix.next_to(tb, DOWN, buff=0.4)
        self.play(FadeOut(pc), FadeIn(fix), run_time=0.7)
        self.at("Each row also keeps the value")
        col = VGroup(*[tb[i].cells[3] for i in range(1, 8)])
        self.play(pulse(col, C["code"]), run_time=1.0)
        self.at("These rows are real")
        c = chip("REAL", "real rows, no model call, no cost").to_corner(UR, buff=0.5)
        self.play(FadeIn(c), run_time=0.5)
        self.at("The decode gate failed")
        raw = T("the gate failed, but the shape scorers ran on the raw draft", size=20, color=MUTED)
        raw.next_to(fix, DOWN, buff=0.3)
        self.play(FadeIn(raw), run_time=0.6)
        self.at("So each broken rule has its own row")
        self.play(*[pulse(tb[i], C["fail"]) for i in (6, 7)], run_time=1.0)
        self.finish()


class RunJudgeStep(HScene):
    key = "27_run_judge_step"

    def construct(self):
        self.add(heading(PART, "the judge step"))
        cs = box("code scorers", C["code"], w=2.6).move_to([-4.6, 1.5, 0])
        dia = Polygon(UP * 0.8, RIGHT * 1.9, DOWN * 0.8, LEFT * 1.9, color=C["judge"], stroke_width=3)
        dia.set_fill(C["judge"], 0.1).move_to([0, 1.5, 0])
        q = para(["decode ok AND", "each strict code", "verdict pass?"], size=18, align=ORIGIN, gap=0.02).move_to(dia)
        jd = box("judges", C["judge"], w=2.0).move_to([4.6, 1.5, 0])
        a1, a2 = link(cs, dia), Arrow(dia.get_right(), jd.get_left(), buff=0.06, color=MUTED, stroke_width=3)
        yes = T("yes", size=18, color=C["pass"]).next_to(a2, UP, buff=0.08)
        self.at("The judge step is the part")
        step = T("judge step: runs each rule check on a draft", size=22, color=C["judge"]).move_to([1.6, 2.75, 0])
        self.play(FadeIn(step), run_time=0.6)
        self.at("It runs the code scorers first")
        self.play(FadeIn(cs), run_time=0.6)
        self.at("It calls the judges only when")
        self.play(GrowArrow(a1), FadeIn(dia), FadeIn(q), run_time=0.8)
        self.play(GrowArrow(a2), FadeIn(yes), FadeIn(jd), run_time=0.7)
        self.at("A code check is free")
        cost = VGroup(T("code check: free", size=20, color=C["code"]).next_to(cs, DOWN, buff=0.25),
                      T("judge call: costs money", size=20, color=C["judge"]).next_to(jd, DOWN, buff=0.25))
        self.play(FadeIn(cost), run_time=0.6)

        self.at("Draft A failed, so no judge ran")
        da = code_card([("draft A:  decode ok false,  each strict code verdict pass false", C["fail"])], size=18)
        da.move_to([0, -0.35, 0])
        x = cross(jd, sw=5)
        self.play(FadeIn(da), Create(x), run_time=0.8)
        self.at("But each rule still needs a row")
        row = code_card([
            ("attributes.is_product@1   attributes[]   cannot_verify   decider: code", C["cv"]),
            '"The output broke the schema or a strict code check, so no judge ran."',
        ], size=18, title="the row for the skipped judge (real)")
        row.move_to([0, -1.75, 0])
        self.play(FadeIn(row.rect), FadeIn(row[2]), FadeIn(row.lines[0]), run_time=0.7)
        self.at("So each skipped judgement rule gets a row")
        self.play(FadeIn(row.lines[1]), run_time=0.6)
        self.at("The next part explains")
        self.play(pulse(row.lines[0], C["cv"]), run_time=0.9)

        self.at("Each judge call answers one rule")
        self.play(FadeOut(VGroup(da, row)), run_time=0.5)
        notes = VGroup(tag("one call per rule, for many items", C["judge"], size=20),
                       tag("reads the full source text, never a summary", C["judge"], size=20),
                       tag("judge model: another provider than the drafter", C["judge"], size=20))
        notes.arrange(DOWN, buff=0.22, aligned_edge=LEFT).move_to([0, -1.1, 0])
        self.play(FadeIn(notes[0]), run_time=0.5)
        self.at("The judge reads the full source text")
        self.play(FadeIn(notes[1]), run_time=0.5)
        self.at("The design uses a judge model")
        self.play(FadeIn(notes[2]), run_time=0.5)
        self.at("The judge step is a design")
        c1 = chip("DESIGN", "DESIGN: judge step (plan.judge_step)")
        c2 = chip("BUILT", "BUILT: skippedJudges rows")
        VGroup(c1, c2).arrange(RIGHT, buff=0.4).to_edge(DOWN, buff=0.3)
        self.play(FadeIn(c1), run_time=0.5)
        self.at("The rows for skipped judges")
        self.play(FadeIn(c2), run_time=0.5)
        self.finish()


class RunJudgeMock(HScene):
    key = "28_run_judge_mock"

    def construct(self):
        self.add(heading(PART, "what a judge says"))
        dc = code_card([
            ('{"key":"zinc_oxide", "amount":200, "unit":"mg", "quote":"Zinc oxide 200 mg"}', FG),
            ('{"key":"gift_sachet", "amount":500, "unit":"mg", "quote":"Free gift sachet 500 mg"}', C["judge"]),
        ], size=18, title="draft C: two attributes (worked example)", color=C["model"])
        dc.move_to([0, 1.9, 0])
        self.at("Take draft C")
        self.play(FadeIn(dc.rect), FadeIn(dc[2]), FadeIn(dc.lines[0]), run_time=0.7)
        self.at("It fixes the unit and the quote")
        self.play(FadeIn(dc.lines[1]), run_time=0.6)
        self.at("Each code scorer passes")
        ok = T("13 code verdicts: all pass (real)  ->  the judges run", size=20, color=C["pass"])
        ok.next_to(dc, DOWN, buff=0.25)
        self.play(FadeIn(ok), run_time=0.6)
        self.at("The judgement rule asks")
        q = T("attributes.is_product@1: does this attribute describe a property of the product itself?", size=20,
              color=C["judge"]).next_to(ok, DOWN, buff=0.35)
        self.play(FadeIn(q), run_time=0.6)
        rows = code_card([
            ("attributes[0]   yes  ->  pass", C["pass"]),
            ("attributes[1]   no   ->  fail", C["fail"]),
            ('  "A gift with an order is a promotion, not a property of the product."', MUTED),
            ("decider: { by: judge, model: mock/judge, promptHash: " + PROMPT_HASH[:8] + "... }", FG),
        ], size=18, title="judge rows", color=C["judge"])
        rows.move_to([-0.4, -2.05, 0])
        st = chip("ILLUSTRATIVE", "ILLUSTRATIVE: mock model").next_to(rows[2], RIGHT, buff=0.3)
        self.at("Zinc oxide gets yes")
        self.play(FadeIn(rows.rect), FadeIn(rows[2]), FadeIn(st), FadeIn(rows.lines[0]), run_time=0.7)
        self.at("The gift sachet gets no")
        self.play(FadeIn(rows.lines[1]), run_time=0.6)
        self.at("A gift with an order is a promotion")
        self.play(FadeIn(rows.lines[2]), run_time=0.6)
        self.at("These answers come from a mock model")
        self.play(pulse(st, C["model"]), run_time=0.9)
        self.at("The mapping is real code")
        mp = code_card([("yes      ->  pass", C["pass"]), ("no       ->  fail", C["fail"]),
                        ("unknown  ->  cannot_verify", C["cv"])], size=18, title="mapping (real code)")
        mp.move_to([3.6, 0.15, 0])
        self.play(FadeOut(VGroup(ok, q)), FadeIn(mp), run_time=0.7)
        self.at("Each judge row also keeps")
        self.play(FadeIn(rows.lines[3]), run_time=0.6)
        self.finish()


class RunRepairLoop(HScene):
    key = "29_run_repair_loop"

    def construct(self):
        self.add(heading(PART, "the repair loop"))
        dr = box("drafter", C["model"], w=2.2).move_to([-4.0, 1.6, 0])
        ck = box("checks", C["code"], w=2.2).move_to([0.0, 1.6, 0])
        a1 = link(dr, ck)
        back = CurvedArrow(ck.get_bottom() + DOWN * 0.05, dr.get_bottom() + DOWN * 0.05, angle=-PI / 2.2,
                           color=C["fail"])
        el = T("the exact errors", size=18, color=C["fail"]).next_to(back, DOWN, buff=0.08)
        self.at("The repair loop sends the exact errors")
        self.play(FadeIn(dr), FadeIn(ck), GrowArrow(a1), run_time=0.8)
        self.play(Create(back), FadeIn(el), run_time=0.8)
        self.at("Think of a writer and an editor")
        ed = panel(para(["the editor does not rewrite;", "the editor lists each error with its fix;",
                         "the writer drafts again from that list"], size=20), color=MUTED, title="writer and editor")
        ed.move_to([3.6, 1.0, 0])
        self.play(FadeIn(ed.rect), FadeIn(ed[2]), run_time=0.5)
        for cue, i in [("The editor does not rewrite", 0), ("The editor lists each error", 1),
                       ("The writer drafts again", 2)]:
            self.at(cue)
            self.play(FadeIn(ed[1][i]), run_time=0.5)

        self.at("Here is the illustrative run")
        self.play(FadeOut(ed), run_time=0.4)
        rounds = VGroup()
        data = [("1/3", "draft A", "3 errors in one message: unit, quote, extra key", C["fail"]),
                ("2/3", "draft C", "judge fails gift_sachet", C["fail"]),
                ("3/3", "draft B", "each rule passes", C["pass"])]
        for n, d, r, col in data:
            g = VGroup(M(n, size=20, color=C["model"]), M(d, size=20), T(r, size=20, color=col))
            g[1].next_to(g[0], RIGHT, buff=0.4)
            g[2].next_to(g[1], RIGHT, buff=0.5)
            rounds.add(g)
        rounds.arrange(DOWN, buff=0.28, aligned_edge=LEFT).move_to([-1.2, -0.65, 0])
        st = chip("ILLUSTRATIVE").next_to(rounds, RIGHT, buff=0.6)
        self.play(FadeIn(st), run_time=0.5)
        for cue, i in [("The first round is draft A", 0), ("The second round is draft C", 1),
                       ("The third round is draft B", 2)]:
            self.at(cue)
            self.play(FadeIn(rounds[i], shift=RIGHT * 0.2), run_time=0.6)

        self.at("The design has four rules")
        self.play(FadeOut(VGroup(rounds, st)), run_time=0.5)
        rl = para(["send all the errors in one round", "name the fix and the allowed values",
                   "keep each failed reply: it cost money", "stop after three rounds: one draft, two repairs"],
                  size=20).move_to([-1.0, -0.8, 0])
        for cue, i in [("Send all the errors", 0), ("Name the fix", 1), ("Keep each failed reply", 2),
                       ("Stop after three rounds", 3)]:
            self.at(cue)
            self.play(FadeIn(rl[i], shift=RIGHT * 0.2), run_time=0.5)
        cnt = VGroup(*[M(t, size=20, color=C["model"]) for t in ("1/3", "2/3", "3/3")]).arrange(RIGHT, buff=0.3)
        cnt.next_to(ck, RIGHT, buff=0.6)
        per = box("person", C["person"], w=1.8, h=0.56, size=20).next_to(cnt, DOWN, buff=0.45)
        self.play(FadeIn(cnt), FadeIn(per), run_time=0.6)

        self.at("A Mastra loop step repeats")
        self.play(FadeOut(rl), run_time=0.4)
        code = code_card([
            ".dountil(draftAndJudge, ({ inputData, iterationCount }) =>",
            "  inputData.errors.length === 0 || iterationCount >= REPAIR_BUDGET)",
        ], size=18, title="design sketch", color=C["mastra"])
        code.move_to([0, -1.3, 0])
        self.play(FadeIn(code), run_time=0.7)
        self.at("It stops when no strict rule fails")
        self.play(pulse(code.lines[1], C["mastra"]), run_time=0.9)
        self.at("The repair loop is a design")
        c = chip("DESIGN").to_corner(UR, buff=0.5)
        self.play(FadeIn(c), run_time=0.5)
        self.finish()


class RunPersonAccept(HScene):
    key = "30_run_person_accept"

    def construct(self):
        self.add(heading(PART, "the person step and the accept"))
        per = box("person step", C["person"], w=2.6).move_to([-4.6, 1.6, 0])
        bars = VGroup(*[Rectangle(width=0.1, height=0.36, stroke_width=0).set_fill(C["person"], 1) for _ in range(2)])
        bars.arrange(RIGHT, buff=0.1).next_to(per, UP, buff=0.12)
        self.at("The person step suspends")
        self.play(FadeIn(per), FadeIn(bars), run_time=0.7)
        rev = panel(para(["open results", "resume: accept or reject"], size=20), color=C["person"], title="reviewer")
        rev.next_to(per, DOWN, buff=0.4)
        self.at("A reviewer reads them")
        self.play(FadeIn(rev), run_time=0.7)

        self.at("What happens when each strict rule passes")
        acc = box("accept", C["pass"], w=2.0).move_to([0.4, 1.6, 0])
        self.play(FadeIn(acc), run_time=0.6)
        self.at("It writes the output")
        db = cylinder("graph store", w=3.2, h=1.0).move_to([4.5, 1.4, 0])
        tabs = VGroup(*[M(t, size=20, color=C["store"]) for t in ("outputs", "records", "verdicts")])
        tabs.arrange(RIGHT, buff=0.35).next_to(db, DOWN, buff=0.3)
        a = Arrow(acc.get_right(), db.get_left(), buff=0.08, color=C["pass"], stroke_width=3)
        self.play(GrowArrow(a), FadeIn(db), run_time=0.7)
        self.play(LaggedStart(*[FadeIn(t) for t in tabs], lag_ratio=0.3), run_time=1.0)
        self.at("Each row names the rule")
        rn = T("each row: rule, version, hash", size=20, color=MUTED).next_to(tabs, DOWN, buff=0.2)
        self.play(FadeIn(rn), run_time=0.5)

        self.at("In the worked example, draft B")
        db_rows = code_card([
            ("attributes.amount@1    attributes[0].amount   pass", C["pass"]),
            ("attributes.key@1       attributes[0].key      pass", C["pass"]),
            ("attributes.list@1      attributes             pass", C["pass"]),
            ("attributes.quote@1     attributes[0].quote    pass", C["pass"]),
            ("quotes.from_label@1    attributes[0].quote    pass", C["pass"]),
            ("units.label_unit@1     attributes[0].unit     pass", C["pass"]),
            ("units.mass_only@1      attributes[0].unit     pass", C["pass"]),
            ("attributes.is_product@1  attributes[0]  pass  (mock judge: yes)", C["model"]),
        ], size=18, title="draft B: code rows (real) + judge row (ILLUSTRATIVE)", gap=0.05)
        db_rows.move_to([-1.7, -1.75, 0])
        self.play(FadeOut(VGroup(rev, per, bars)), FadeIn(db_rows.rect), FadeIn(db_rows[2]),
                  LaggedStart(*[FadeIn(l) for l in db_rows.lines[:7]], lag_ratio=0.15), run_time=1.4)
        self.play(FadeIn(db_rows.lines[7]), run_time=0.5)
        self.at("So the illustrative run ends")
        self.play(pulse(acc, C["pass"]), run_time=0.9)

        self.at("The graph store refuses each later update")
        lock = code_card([("harness.outputs is append-only: update is refused", C["fail"])], size=18,
                         title="trigger message (db/migrations/0001_harness_tables.sql)", color=C["store"])
        lock.move_to([0, -1.9, 0])
        self.play(FadeOut(db_rows), FadeIn(lock), run_time=0.7)
        self.at("A new run writes new rows")
        nr = T("a new run writes new rows", size=20, color=MUTED).next_to(lock, UP, buff=0.5)
        self.play(FadeIn(nr), run_time=0.5)
        self.at("The person step and the accept step")
        c1 = chip("DESIGN", "DESIGN: person + accept steps").move_to([-2.4, -3.4, 0])
        self.play(FadeIn(c1), run_time=0.5)
        self.at("The tables and their refusals")
        c2 = chip("BUILT", "BUILT: tables + refusals").next_to(c1, RIGHT, buff=0.4)
        self.play(FadeIn(c2), run_time=0.5)
        self.finish()


class RunStates(HScene):
    key = "31_run_states"

    def construct(self):
        self.add(heading(PART, "the states of one stage run (design)"))
        y = 1.5
        S_ = {}
        for name, x, col in [("context", -5.6, C["tree"]), ("research", -3.3, C["tree"]), ("draft", -1.1, C["model"]),
                             ("judging", 1.1, C["judge"])]:
            S_[name] = box(name, col, w=1.9, h=0.62, size=20, mono=True).move_to([x, y, 0])
        S_["suspended"] = box("suspended", C["person"], w=2.1, h=0.62, size=20, mono=True).move_to([4.3, y, 0])
        S_["accepted"] = box("accepted", C["pass"], w=2.1, h=0.62, size=20, mono=True).move_to([4.3, y - 1.3, 0])
        S_["rejected"] = box("rejected", C["fail"], w=2.1, h=0.62, size=20, mono=True).move_to([4.3, y + 1.1, 0])
        A = {}
        A["c_r"] = link(S_["context"], S_["research"])
        A["r_d"] = link(S_["research"], S_["draft"])
        A["d_j"] = link(S_["draft"], S_["judging"])
        A["j_d"] = CurvedArrow(S_["judging"].get_bottom(), S_["draft"].get_bottom(), angle=-PI / 2, color=C["model"])
        A["j_s"] = link(S_["judging"], S_["suspended"])
        A["j_a"] = Arrow(S_["judging"].get_right(), S_["accepted"].get_left(), buff=0.06, color=MUTED, stroke_width=3)
        A["s_a"] = link(S_["suspended"], S_["accepted"], side="v")
        A["s_x"] = link(S_["suspended"], S_["rejected"], side="v")
        rep = T("repair round", size=18, color=C["model"]).next_to(A["j_d"], DOWN, buff=0.05)
        self.at("Here they are for one stage run")
        self.play(FadeIn(S_["context"]), run_time=0.5)
        self.at("A run starts at context")
        self.play(GrowArrow(A["c_r"]), FadeIn(S_["research"]), run_time=0.6)
        self.play(GrowArrow(A["r_d"]), FadeIn(S_["draft"]), run_time=0.6)
        self.at("After the draft, the run sits")
        self.play(GrowArrow(A["d_j"]), FadeIn(S_["judging"]), run_time=0.6)
        self.at("It goes back to draft")
        self.play(Create(A["j_d"]), FadeIn(rep), run_time=0.7)
        self.at("It suspends at the person step")
        self.play(GrowArrow(A["j_s"]), FadeIn(S_["suspended"]), run_time=0.6)
        self.at("Or it ends as accepted")
        self.play(GrowArrow(A["j_a"]), FadeIn(S_["accepted"]), run_time=0.6)
        self.at("A reviewer turns a suspended run")
        self.play(GrowArrow(A["s_a"]), GrowArrow(A["s_x"]), FadeIn(S_["rejected"]), run_time=0.8)

        self.at("Mastra keeps its own status")
        mt = T("Mastra run status", size=20, color=C["mastra"]).move_to([-4.6, -1.3, 0])
        ms = VGroup(*[box(s, C["mastra"], h=0.5, size=20, mono=True, fill=0.08) for s in ("success", "failed", "suspended")])
        ms.arrange(RIGHT, buff=0.25).next_to(mt, RIGHT, buff=0.4)
        self.play(FadeIn(mt), run_time=0.5)
        self.at("A Mastra run has a status")
        self.play(LaggedStart(*[FadeIn(m) for m in ms], lag_ratio=0.3), run_time=0.9)
        self.at("Mastra has more statuses")
        more = T("also: canceled, paused, ...", size=18, color=MUTED).next_to(ms, RIGHT, buff=0.3)
        self.play(FadeIn(more), run_time=0.5)
        self.at("A suspended stage run is a suspended Mastra run")
        same = T("= the stage run's suspended state", size=18, color=C["person"]).next_to(ms[2], DOWN, buff=0.12)
        self.play(pulse(S_["suspended"], C["person"]), pulse(ms[2], C["person"]), FadeIn(same), run_time=1.0)

        self.at("Rules have states too")
        rt = T("rule status", size=20, color=C["rule"]).move_to([-4.6, -2.7, 0]).align_to(mt, LEFT)
        rs = VGroup(*[box(s, C["rule"], h=0.5, size=20, mono=True, fill=0.08) for s in ("draft", "active", "retired")])
        rs.arrange(RIGHT, buff=1.6).next_to(rt, RIGHT, buff=0.4)
        ra = VGroup(link(rs[0], rs[1], sw=2), link(rs[1], rs[2], sw=2))
        self.play(FadeIn(rt), run_time=0.4)
        self.at("A rule is draft, active, or retired")
        self.play(FadeIn(rs), *[GrowArrow(a) for a in ra], run_time=0.8)
        self.at("Only an active rule applies")
        self.play(pulse(rs[1], C["rule"]), run_time=0.9)
        self.at("A new version of a rule starts")
        self.play(pulse(rs[0], C["rule"]), run_time=0.9)
        self.at("Rohan makes it active")
        pr = T("Rohan's PR", size=18, color=C["rule"]).next_to(ra[0], UP, buff=0.08)
        self.play(FadeIn(pr), run_time=0.5)
        self.finish()
