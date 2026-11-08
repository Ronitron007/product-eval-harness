"""Part part.compiler: the compiler. Values on screen come from worked-example/output-2026-11-07.txt."""
from manim import *

from style import *
from timing import HScene
from rules import strip

PART = "part.compiler: the compiler"
H_SUN = "f8d76e16201616281414918b85528655fa9cced4c14bac055b8c9f8a415eaf9a"
H_MOI = "ec713b82d73c78dd52b70bd7218228d89ecc6319c10c9a77ff81044f63feb999"


def short(h):
    return f"{h[:8]}...{h[-8:]}"


class CompilerWhat(HScene):
    key = "17_compiler_what"

    def construct(self):
        self.add(heading(PART, "what the compiler does"))
        od = outline_beat(self, "compiler", "compiler_outputs")
        self.at("Think of a printed rulebook")
        self.play(FadeOut(od), run_time=0.6)
        office = box("one office", C["compiler"], w=2.6, h=0.9).move_to([0, 1.6, 0])
        book = box("printed rulebook", C["compiler"], w=3.2, h=0.8, fill=0.06).move_to([-2.6, -0.1, 0])
        chk = box("inspection checklist", C["code"], w=3.4, h=0.8, fill=0.06).move_to([2.6, -0.1, 0])
        self.play(FadeIn(book), FadeIn(chk), run_time=0.7)
        self.at("One office makes both")
        a1, a2 = link(office, book, side="v"), link(office, chk, side="v")
        self.play(FadeIn(office), GrowArrow(a1), GrowArrow(a2), run_time=0.8)
        self.at("So the two cannot disagree")
        agree = T("same source, same moment: they cannot disagree", size=22, color=MUTED).next_to(VGroup(book, chk),
                                                                                                 DOWN, buff=0.5)
        self.play(FadeIn(agree), run_time=0.6)

        self.at("The compiler takes all the rule files")
        self.play(FadeOut(VGroup(office, book, chk, a1, a2, agree)), run_time=0.5)
        ins = VGroup(*[box(t, col, w=2.8, h=0.52, size=20, fill=0.06) for t, col in [
            ("rule files", C["rule"]), ("derived rules", C["rule"]), ("the tree", C["tree"]),
            ("one node", C["tree"]), ("one stage", C["tree"])]]).arrange(DOWN, buff=0.16).move_to([-4.9, 0.0, 0])
        cs = box("compileStage", C["compiler"], w=3.0, h=1.0, mono=True, size=24).move_to([-0.6, 0.0, 0])
        outs = VGroup(*[box(t, C["compiler"], w=3.0, h=0.56, size=20, fill=0.06) for t in [
            "output schema", "instruction text", "one scorer per rule", "rule-set hash"]])
        outs.arrange(DOWN, buff=0.2).move_to([4.6, 0.0, 0])
        a_in = VGroup(*[Arrow(i.get_right(), cs.get_left(), buff=0.06, color=MUTED, stroke_width=2, tip_length=0.12)
                        for i in ins])
        a_out = VGroup(*[Arrow(cs.get_right(), o.get_left(), buff=0.06, color=MUTED, stroke_width=2, tip_length=0.12)
                         for o in outs])
        self.play(LaggedStart(*[FadeIn(i) for i in ins], lag_ratio=0.2), FadeIn(cs), *[GrowArrow(a) for a in a_in],
                  run_time=1.6)
        self.at("It gives four things")
        self.play(*[GrowArrow(a) for a in a_out], run_time=0.6)
        self.at("They are an output schema")
        self.play(LaggedStart(*[FadeIn(o, shift=LEFT * 0.2) for o in outs], lag_ratio=0.3), run_time=1.4)
        br = Brace(outs, RIGHT, color=C["compiler"])
        one = T("one source", size=20, color=C["compiler"]).next_to(br, RIGHT, buff=0.1).rotate(PI / 2)
        one.next_to(br, RIGHT, buff=0.1)
        self.play(GrowFromCenter(br), FadeIn(one), run_time=0.6)

        self.at("The compiler is plain code")
        st1 = tag("plain code: no model call", C["code"], size=20)
        st1.next_to(cs, DOWN, buff=1.2)
        self.play(FadeIn(st1), run_time=0.5)
        self.at("It calls no model")
        st2 = tag("never throws on rule data", C["code"], size=20).next_to(st1, DOWN, buff=0.15)
        self.play(FadeIn(st2), run_time=0.5)
        self.at("It returns admission problems alone")
        st3 = tag("admission problems: alone", FG, size=20).next_to(cs, UP, buff=1.0)
        self.play(FadeIn(st3), run_time=0.5)
        self.at("After admission passes")
        st4 = tag("then scope + weaken + shape problems: one list", FG, size=20).next_to(st3, UP, buff=0.15)
        self.play(FadeIn(st4), run_time=0.5)
        self.at("The compiler exists in code today")
        c = chip("BUILT", "BUILT").to_corner(UR, buff=0.5)
        self.play(FadeIn(c), run_time=0.5)
        self.at("It shipped on the fourth")
        ship = T("shipped 2026-11-04 in Ronitron007/product-eval-harness#19", size=18, color=MUTED)
        ship.to_edge(DOWN, buff=0.3)
        self.play(FadeIn(ship), run_time=0.5)
        self.finish()


class CompilerOneSource(HScene):
    key = "18_compiler_one_source"

    def construct(self):
        self.add(heading(PART, "one source for the prompt and the check"))
        p1 = code_card([("prompt: write mg, mcg or g", FG)], size=20, title="copy one: the prompt")
        c1 = code_card([("check: one of [mg, mcg]", FG)], size=20, title="copy two: the check")
        VGroup(p1, c1).arrange(RIGHT, buff=1.0).move_to(UP * 0.8)
        self.at("Two copies drift apart")
        self.play(FadeIn(p1), FadeIn(c1), run_time=0.7)
        self.at("A person edits the prompt")
        neq = T("the copies disagree", size=22, color=C["fail"]).next_to(VGroup(p1, c1), DOWN, buff=0.4)
        self.play(c1.lines[0].animate.set_color(C["fail"]), FadeIn(neq), run_time=0.7)

        self.at("So each value of a rule lives")
        self.play(FadeOut(VGroup(p1, c1, neq)), run_time=0.5)
        params = code_card([("values: [mg, mcg, g]", C["rule"])], size=24, title="the parameters of units.label_unit")
        params.move_to([0, 1.7, 0])
        ins = code_card([("Shape: text, one of: g, mcg, mg", FG)], size=20, title="instruction line")
        chk = code_card([("check: one of g, mcg, mg", FG)], size=20, title="the check")
        VGroup(ins, chk).arrange(RIGHT, buff=1.2).move_to([0, -0.6, 0])
        self.play(FadeIn(params), run_time=0.6)
        self.at("The prompt line and the check both read")
        a1 = Arrow(params.get_bottom(), ins.get_top() + UP * 0.35, buff=0.08, color=C["rule"], stroke_width=3)
        a2 = Arrow(params.get_bottom(), chk.get_top() + UP * 0.35, buff=0.08, color=C["rule"], stroke_width=3)
        self.play(GrowArrow(a1), GrowArrow(a2), FadeIn(ins), FadeIn(chk), run_time=0.9)
        self.at("A test proves it")
        tn = tag("test: drift.values_move_both", C["code"], size=20).next_to(VGroup(ins, chk), DOWN, buff=0.4)
        self.play(FadeIn(tn), run_time=0.5)
        self.at("Change the allowed units")
        new_p = SM("values: [mg, mcg]", size=24, color=C["rule"]).move_to(params.lines[0], aligned_edge=LEFT)
        new_i = SM("Shape: text, one of: mcg, mg", size=20).move_to(ins.lines[0], aligned_edge=LEFT)
        new_c = SM("check: one of mcg, mg", size=20).move_to(chk.lines[0], aligned_edge=LEFT)
        self.play(Transform(params.lines[0], new_p), run_time=0.6)
        self.play(Transform(ins.lines[0], new_i), Transform(chk.lines[0], new_c), run_time=0.8)

        self.at("The loader also refuses a statement")
        self.play(FadeOut(VGroup(params, ins, chk, a1, a2, tn)), run_time=0.5)
        r1 = code_card([("statement: Write the amount in mg.", FG)], size=20, title="example: holds a value")
        r2 = code_card([("statement: List at most 12 attributes.", FG)], size=20, title="example: holds a number")
        VGroup(r1, r2).arrange(DOWN, buff=0.6, aligned_edge=LEFT).move_to([-1.6, 0.3, 0])
        self.at("Units label unit may not hold")
        l1 = tag("refused: literal lint", C["fail"]).next_to(r1, RIGHT, buff=0.4)
        self.play(FadeIn(r1), FadeIn(l1), run_time=0.7)
        self.at("Its statement may not hold a number")
        l2 = tag("refused: numeral lint", C["fail"]).next_to(r2, RIGHT, buff=0.4)
        self.play(FadeIn(r2), FadeIn(l2), run_time=0.7)
        self.at("The compiler prints each value once")
        once = T("each value prints once, from the parameters", size=22, color=C["rule"]).next_to(
            VGroup(r1, r2, l1, l2), DOWN, buff=0.5)
        self.play(FadeIn(once), run_time=0.6)
        self.at("These guards exist in code")
        c = chip("BUILT").to_corner(UR, buff=0.5)
        self.play(FadeIn(c), run_time=0.5)
        self.finish()


class CompilerAdmitScope(HScene):
    key = "19_compiler_admit_scope"

    def construct(self):
        self.add(heading(PART, "admit, then apply the scope"))
        rs = box("rule set", C["rule"], w=2.2).move_to([-5.2, 1.7, 0])
        gate = box("admit", C["compiler"], w=1.8, mono=True).move_to([-2.2, 1.7, 0])
        ok = T("0 loader problems: pass", size=20, color=C["pass"]).next_to(gate, RIGHT, buff=0.5)
        self.at("It admits the rules")
        self.play(FadeIn(rs), GrowArrow(a := link(rs, gate)), FadeIn(gate), run_time=0.8)
        self.play(FadeIn(ok), run_time=0.5)
        self.at("It refuses a rule set with any loader problem")
        bad = code_card([
            ("skincare/units.label_unit.yaml version: The words changed under version 1.", C["fail"]),
            ("Raise the version, set supersedes to 1, and run npm run rules:lock.", C["fail"]),
        ], size=18, title="new words under an old version (real)  ->  library_invalid")
        bad.move_to([0, 0.15, 0])
        self.play(FadeIn(bad), run_time=0.8)

        self.at("Then it applies the scope")
        self.play(FadeOut(bad), FadeOut(ok), run_time=0.4)
        led = code_card([(f"{r}  git  {{\"kind\":\"applied\",\"binding\":\"strict\"}}", FG) for r in [
            "attributes.amount@1", "attributes.is_product@1", "attributes.key@1", "attributes.list@1",
            "attributes.quote@1", "quotes.from_label@1", "units.label_unit@1", "units.mass_only@1"]],
            size=18, title="ledger at sunscreen, create_node (real)")
        led.move_to([0, -0.55, 0])
        self.at("It writes one line")
        self.play(FadeIn(led.rect), FadeIn(led[2]), run_time=0.4)
        self.play(LaggedStart(*[FadeIn(l) for l in led.lines], lag_ratio=0.2), run_time=1.8)
        self.at("The line says applied")
        self.play(pulse(led.lines[7], C["pass"]), run_time=0.8)

        self.at("Here is the real result at moisturizer")
        self.play(FadeOut(led), FadeOut(VGroup(rs, gate, a)), run_time=0.5)
        moi = code_card([
            ("units.mass_only@1  {\"kind\":\"excluded\",\"reason\":\"owner_not_on_path\"}", C["cv"]),
            ("  Shape: text, one of: g, mcg, mg", FG),
        ], size=20, title="compile at moisturizer, create_node (real)")
        moi.move_to([0, 1.5, 0])
        self.play(FadeIn(moi.rect), FadeIn(moi[2]), FadeIn(moi.lines[0]), run_time=0.7)
        tree = category_tree(levels=False, dx=2.6, dy=0.95, size=18).move_to([-3.6, -1.6, 0])
        N = tree.nodes
        self.at("Units mass only stays out")
        path = VGroup(N["moisturizer"], N["skincare"])
        self.play(FadeIn(tree), run_time=0.6)
        self.play(*[n.rect.animate.set_fill(C["tree"], 0.5) for n in path], run_time=0.6)
        own = tag("owner: sunscreen, not on the path", C["fail"], size=18).next_to(tree, DOWN, buff=0.2)
        self.play(FadeIn(own), run_time=0.5)
        self.at("So at moisturizer, the unit can still")
        self.play(FadeIn(moi.lines[1]), run_time=0.6)
        self.at("The compile at moisturizer also gives")
        hs = code_card([("sunscreen     " + short(H_SUN), FG), ("moisturizer   " + short(H_MOI), C["rule"])],
                       size=20, title="rule-set hash (real)")
        hs.move_to([3.4, -1.6, 0])
        self.play(FadeIn(hs), run_time=0.7)
        self.at("This part exists in code")
        c = chip("BUILT").to_corner(UR, buff=0.5)
        self.play(FadeIn(c), run_time=0.5)
        self.finish()


class CompilerNarrow(HScene):
    key = "20_compiler_narrow"

    def construct(self):
        self.add(heading(PART, "narrow: the strictest values that satisfy both"))
        par = strip(["mg", "mcg", "g"], C["rule"], "skincare  units.label_unit@1").move_to([-3.6, 1.6, 0])
        chi = strip(["mg"], C["rule"], "sunscreen  units.mass_only@1")
        chi.next_to(par, DOWN, buff=0.5).align_to(par, LEFT)
        self.at("The compiler takes the strictest")
        meet = T("both apply: the values in both", size=22, color=C["compiler"]).move_to([3.0, 1.2, 0])
        self.play(FadeIn(meet), run_time=0.6)
        self.at("Two rules of one owner")
        conf = tag("two rules of one owner, other values: slot_conflict, refused", C["fail"], size=20)
        conf.next_to(meet, DOWN, buff=0.3)
        self.play(FadeIn(conf), run_time=0.6)
        self.at("At sunscreen, units label unit allows")
        self.play(FadeIn(par), run_time=0.7)
        self.at("Units mass only allows milligrams")
        self.play(FadeIn(chi), run_time=0.7)
        self.at("Both rules apply")
        res = strip(["mg"], C["compiler"], "result at sunscreen")
        res.next_to(chi, DOWN, buff=0.5).align_to(par, LEFT)
        self.play(TransformFromCopy(VGroup(par[0][0], chi[0][0]), res[0][0]), FadeIn(res[1]), run_time=0.9)

        self.at("Here is the real schema")
        self.play(FadeOut(VGroup(meet, conf)), run_time=0.4)
        sch = code_card(['"unit": { "type": "string", "enum": ["mg"] }'], size=18, title="schema (real)")
        sch.move_to([2.9, 1.5, 0])
        self.play(FadeIn(sch), run_time=0.6)
        self.at("The unit field is an enum")
        self.play(pulse(sch.lines[0], C["compiler"]), run_time=0.9)
        self.at("The instruction text shows")
        ins = code_card([
            "attributes[].unit",
            ("  Shape: text, one of: mg", C["compiler"]),
            "  strict `units.label_unit@1`. Write the amount in the unit that",
            "    the label prints. Why: A grade must rest on what the label states.",
            "  strict `units.mass_only@1`. Write each sunscreen active in one",
            "    unit of mass. Why: One unit lets two sunscreens be compared ...",
        ], size=18, title="instructions at sunscreen (real, wrapped)")
        ins.move_to([0, -1.4, 0])
        self.play(FadeOut(VGroup(par, chi, res)), FadeIn(ins.rect), FadeIn(ins[2]), FadeIn(ins.lines[:2]),
                  run_time=0.7)
        self.at("Both rules also print")
        self.play(FadeIn(ins.lines[2:]), run_time=0.8)
        self.at("If two rules share no value")
        self.play(FadeOut(ins), run_time=0.4)
        none = code_card([("no shared value  ->  the stage is refused, and both rules are named", C["fail"])],
                         size=20)
        none.move_to([0, -1.9, 0])
        self.play(FadeIn(none), run_time=0.6)
        self.at("This part exists in code")
        c = chip("BUILT").to_corner(UR, buff=0.5)
        self.play(FadeIn(c), run_time=0.5)
        self.finish()


class CompilerWeaken(HScene):
    key = "21_compiler_weaken"

    def construct(self):
        self.add(heading(PART, "weaken: a child may not widen"))
        par = strip(["mg", "mcg", "g"], C["rule"], "skincare  units.label_unit@1").move_to([-3.2, 1.7, 0])
        self.play(FadeIn(par), run_time=0.6)
        self.at("Take a child rule")
        chi = strip(["mg", "IU"], C["rule"], "sunscreen  units.allow_iu@1 (worked-example variant)")
        chi.next_to(par, DOWN, buff=0.55).align_to(par, LEFT)
        self.play(FadeIn(chi[1]), FadeIn(chi[0][0]), run_time=0.6)
        self.at("It allows milligrams and international units")
        iu = chi[0][1]
        iu.rect.set_color(C["fail"]).set_fill(C["fail"], 0.15)
        iu.next_to(par[0], RIGHT, buff=0.35).match_y(chi[0][0])  # IU sits outside the parent's values
        x_edge = par[0].get_right()[0] + 0.04
        edge = DashedLine([x_edge, chi[0].get_top()[1] + 0.12, 0], [x_edge, chi[0].get_bottom()[1] - 0.12, 0],
                          color=C["fail"], stroke_width=4)
        self.play(FadeIn(iu), run_time=0.6)
        self.play(Create(edge), run_time=0.5)
        self.at("The parent still applies")
        f1 = T("the check: IU fails anyway", size=22, color=C["code"]).move_to([3.4, 1.6, 0])
        self.play(FadeIn(f1), run_time=0.6)
        self.at("But the child prints an instruction")
        f2 = T("the instruction: IU is fine", size=22, color=C["fail"]).next_to(f1, DOWN, buff=0.35)
        self.play(FadeIn(f2), run_time=0.6)
        self.at("Then the instruction says one thing")
        f3 = T("they disagree", size=22, color=C["fail"], weight="BOLD").next_to(f2, DOWN, buff=0.35)
        self.play(FadeIn(f3), run_time=0.6)

        self.at("So the compiler refuses it")
        prob = code_card([
            ("weakens  units.allow_iu@1  units.label_unit@1  attributes[].unit", C["fail"]),
            "sunscreen units.allow_iu@1 allows IU, which skincare units.label_unit@1",
            "forbids. Change the skincare rule, or drop the value.",
        ], size=18, title="compileStage at sunscreen: ok false (real)")
        prob.move_to([0, -2.0, 0])
        self.play(FadeOut(VGroup(f1, f2, f3)), FadeIn(prob.rect), FadeIn(prob[2]), FadeIn(prob.lines[0]),
                  run_time=0.7)
        self.at("Sunscreen units allow I U allows")
        self.play(FadeIn(prob.lines[1]), run_time=0.6)
        self.at("Change the skincare rule")
        self.play(FadeIn(prob.lines[2]), run_time=0.6)

        self.at("One limit applies")
        self.play(FadeOut(VGroup(par, chi, edge)), prob.animate.move_to([0, 1.5, 0]), run_time=0.7)
        ci = code_card(["auditLibrary({ tree: 'unknown' })", ("->  []", C["pass"])], size=20,
                       title="the rules check on each pull request (real)")
        rt = code_card(["compileStage at sunscreen", ("->  refused", C["fail"])], size=20, title="compile at run time (real)")
        VGroup(ci, rt).arrange(RIGHT, buff=0.8).move_to([0, -1.5, 0])
        self.at("The rules check that runs")
        self.play(FadeIn(ci.rect), FadeIn(ci[2]), FadeIn(ci.lines[0]), run_time=0.7)
        notree = T("no tree: cannot see this problem", size=20, color=MUTED).next_to(ci, DOWN, buff=0.2)
        self.play(FadeIn(notree), run_time=0.5)
        self.at("Here, that check shows no problem")
        self.play(FadeIn(ci.lines[1]), run_time=0.5)
        self.at("The compile at run time refuses")
        self.play(FadeIn(rt), run_time=0.7)
        self.finish()


INSTR = [  # worked-example output, section "instructions" (shortened: Why lines and some examples cut)
    ("Stage create_node. Write one output that fits the output schema. ...", MUTED),
    ("attributes", C["compiler"]),
    "  Shape: list of at least 1 item",
    ("attributes[]", C["compiler"]),
    "  Shape: object with the keys amount, key, quote, unit",
    ("attributes[].amount", C["compiler"]),
    "  Shape: number, at least 0",
    ("attributes[].key", C["compiler"]),
    "  Shape: text of at least 1 character",
    ("attributes[].quote", C["compiler"]),
    "  Shape: text of at least 1 character",
    "  strict `attributes.quote@1`. Give the words that each attribute rests on.",
    "  strict `quotes.from_label@1`. Back each attribute value with a quote",
    "    from the source text.",
    ("    Check: Copy each quote word for word from the label text,", C["code"]),
    ("    with the same letter case.", C["code"]),
    '    Example: {"expected":"pass", ... ,"output":"Zinc oxide 200 mg"}',
    ("attributes[].unit", C["compiler"]),
    "  Shape: text, one of: mg",
]


class CompilerInstructions(HScene):
    key = "22_compiler_instructions"

    def construct(self):
        self.add(heading(PART, "what the model reads"))
        card = code_card(INSTR, size=18, title="instructions at sunscreen (real output, shortened and wrapped)",
                         gap=0.035)
        card.move_to([0, -0.45, 0])
        L = card.lines
        self.at("It reads the instruction text")
        self.play(FadeIn(card.rect), FadeIn(card[2]), FadeIn(L[0]), run_time=0.7)
        self.at("The compiler lists each field")
        heads = [1, 3, 5, 7, 9, 17]
        self.play(LaggedStart(*[FadeIn(L[i], shift=RIGHT * 0.1) for i in heads], lag_ratio=0.25), run_time=1.6)
        self.at("Under each field")
        self.play(LaggedStart(*[FadeIn(L[i]) for i in (2, 4, 6, 8, 10, 18)], lag_ratio=0.2), run_time=1.4)
        self.at("Each rule prints its name")
        self.play(FadeIn(L[11:14]), run_time=0.7)
        self.at("A code check also prints")
        self.play(FadeIn(L[14:16]), run_time=0.6)
        self.play(pulse(L[14:16], C["code"]), run_time=0.9)
        self.at("The golden examples come next")
        self.play(FadeIn(L[16]), run_time=0.6)
        self.at("Two things never print")
        g1 = tag("watch rules", MUTED, size=20)
        g2 = tag("judge question", MUTED, size=20)
        ghosts = VGroup(g1, g2).arrange(RIGHT, buff=0.5).to_corner(UR, buff=0.45)
        never = T("never printed:", size=20, color=MUTED).next_to(ghosts, LEFT, buff=0.3)
        self.play(FadeIn(never), run_time=0.4)
        self.at("A watch rule never prints")
        self.play(FadeIn(g1), Create(strike(g1, sw=3)), run_time=0.6)
        self.at("A judgement rule never prints")
        self.play(FadeIn(g2), Create(strike(g2, sw=3)), run_time=0.6)
        self.at("The text on the screen is the real output")
        self.play(pulse(card.rect, C["compiler"]), run_time=1.0)
        self.finish()


class CompilerSchemaScorers(HScene):
    key = "23_compiler_schema_scorers"

    def construct(self):
        self.add(heading(PART, "the schema and the scorers"))
        sch = code_card([
            '{ "type": "object",',
            '  "properties": { "attributes": { "type": "array", "minItems": 1,',
            '    "items": { "type": "object",',
            '      "properties": { "amount": ..., "key": ..., "quote": ...,',
            '                      "unit": { "enum": ["mg"] } },',
            '      "required": ["amount", "key", "quote", "unit"],',
            ('      "additionalProperties": false } } },', FG),
            ('  "required": ["attributes"],', FG),
            ('  "additionalProperties": false }', FG),
        ], size=18, title="output schema at sunscreen (real, shortened)", gap=0.04)
        sch.move_to([0, 1.05, 0])
        self.at("It decodes into the output schema")
        self.play(FadeIn(sch), run_time=0.8)
        self.at("Each object in it refuses an extra key")
        self.play(*[L.animate.set_color(C["fail"]) for L in (sch.lines[6], sch.lines[8])], run_time=0.6)
        self.at("Each object also requires")
        self.play(*[L.animate.set_color(C["compiler"]) for L in (sch.lines[5], sch.lines[7])], run_time=0.6)

        self.at("Next come the scorers")
        codes = ["attributes.amount@1", "attributes.key@1", "attributes.list@1", "attributes.quote@1",
                 "quotes.from_label@1", "units.label_unit@1", "units.mass_only@1"]
        cs = VGroup(*[box(c, C["code"], w=3.3, h=0.46, size=18, mono=True, fill=0.08) for c in codes])
        cs.arrange_in_grid(rows=4, cols=2, buff=(0.25, 0.1), flow_order="dr").move_to([-2.4, -2.3, 0])
        self.at("At sunscreen, the compiler made seven")
        title = T("7 code scorers", size=20, color=C["code"]).next_to(cs, UP, buff=0.12).align_to(cs, LEFT)
        self.play(FadeIn(title), LaggedStart(*[FadeIn(c) for c in cs], lag_ratio=0.15), run_time=1.6)
        self.at("The judgement rule gets a judge scorer")
        door = box("judges(model)", C["judge"], w=2.8, h=0.5, size=18, mono=True, fill=0.04).move_to([3.9, -1.55, 0])
        js = box("attributes.is_product@1", C["judge"], w=3.6, h=0.46, size=18, mono=True, fill=0.08)
        js.next_to(door, DOWN, buff=0.2)
        self.play(FadeIn(door), FadeIn(js), run_time=0.7)
        self.at("The compiler makes a judge scorer only")
        only = T("only when a caller gives a judge model", size=18, color=C["judge"]).next_to(js, DOWN, buff=0.2)
        self.play(FadeIn(only), run_time=0.6)
        self.at("So the compile itself never touches")
        self.play(pulse(VGroup(cs, title), C["code"]), run_time=1.0)
        self.at("A test setup makes each network call throw")
        stamp = tag("tests/setup/no-network.ts: fetch throws", C["fail"], size=18).to_corner(UR, buff=0.45)
        self.play(FadeIn(stamp), run_time=0.6)
        self.finish()


class CompilerRuleSetHash(HScene):
    key = "24_compiler_rule_set_hash"

    def construct(self):
        self.add(heading(PART, "the rule-set hash"))
        man = code_card([
            "format",
            ("code: { runtime: 1, checks: { quote_in_source: 1 },", MUTED),
            ("        deps: { zod: 4.6.7, @mastra/core: 1.79.0 } }", MUTED),
            "stage",
            "rules[]: id, version, hash, binding, origin",
            "schema",
            "instructions",
            "scorers[]",
        ], size=18, title="the manifest: what the compiler made", color=C["compiler"])
        man.move_to([-2.4, 0.7, 0])
        sha = box("sha256", C["compiler"], w=1.8, mono=True).next_to(man, RIGHT, buff=0.9)
        self.at("The rule-set hash answers that")
        self.play(FadeIn(man.rect), FadeIn(man[2]), run_time=0.5)
        self.at("The compiler takes the hash")
        self.play(GrowArrow(a := link(man, sha)), FadeIn(sha), run_time=0.7)
        self.at("That list holds the schema")
        order = [5, 6, 7, 4, 1, 2, 0, 3]
        self.play(LaggedStart(*[FadeIn(man.lines[i]) for i in order], lag_ratio=0.2), run_time=2.0)
        self.at("So each input that changes an output")
        every = T("each input that changes an output changes the hash", size=20, color=C["compiler"])
        every.next_to(sha, DOWN, buff=0.4)
        if every.get_right()[0] > 6.9:
            every.to_edge(RIGHT, buff=0.3)
        self.play(FadeIn(every), run_time=0.6)

        self.at("Here is the real result")
        self.play(FadeOut(VGroup(man, sha, a, every)), run_time=0.5)
        rows = [
            ("sunscreen", H_SUN, None),
            ("sunscreen, tree reversed", H_SUN, ("same", C["pass"])),
            ("moisturizer", H_MOI, ("different", C["rule"])),
        ]
        tb = VGroup()
        for i, (name, h, verdict) in enumerate(rows):
            r = VGroup(T(name, size=20, color=MUTED), M(h, size=18))
            r[0].move_to([-4.6, 1.7 - i * 0.95, 0], aligned_edge=LEFT)
            r[1].move_to([-4.6, 1.35 - i * 0.95, 0], aligned_edge=LEFT)
            tb.add(r)
        marks = VGroup()
        for (name, h, verdict), r in zip(rows, tb):
            if verdict:
                marks.add(T(verdict[0], size=20, color=verdict[1], weight="BOLD").next_to(r[1], RIGHT, buff=0.3))
        title = T("rule-set hash (real, worked example)", size=18, color=MUTED).next_to(tb, UP, buff=0.3).align_to(tb, LEFT)
        self.play(FadeIn(title), FadeIn(tb[0]), run_time=0.7)
        self.at("Compile at sunscreen two times")
        self.play(FadeIn(tb[1]), run_time=0.6)
        self.at("The hash stays the same")
        self.play(FadeIn(marks[0]), run_time=0.5)
        self.at("Compile at moisturizer")
        self.play(FadeIn(tb[2]), run_time=0.6)
        self.play(FadeIn(marks[1]), run_time=0.5)

        self.at("The store writes this hash")
        cols = code_card(["stage_runs.rule_set_hash", "outputs.rule_set_hash"], size=20, title="graph store columns",
                         color=C["store"])
        cols.move_to([-3.2, -2.1, 0])
        c1 = chip("BUILT").next_to(cols, RIGHT, buff=0.3)
        self.play(FadeIn(cols), FadeIn(c1), run_time=0.7)
        self.at("The design also compiles again")
        rec = tag("compile again in each step, compare the hash", FG, size=20).move_to([3.95, -1.8, 0])
        c2 = chip("DESIGN").next_to(rec, DOWN, buff=0.2)
        self.play(FadeIn(rec), FadeIn(c2), run_time=0.7)
        self.at("A rule change in the middle")
        stop = T("a rule change mid-run stops the run", size=20, color=C["fail"]).next_to(c2, DOWN, buff=0.2)
        self.play(FadeIn(stop), run_time=0.6)
        self.finish()
