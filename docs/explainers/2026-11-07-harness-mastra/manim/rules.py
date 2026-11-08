"""Part part.rules: rules written as data."""
from manim import *

from style import *
from timing import HScene

PART = "part.rules: rules written as data"

YAML = [  # worked-example/rules/skincare/units.label_unit.yaml (real fixture)
    "id: units.label_unit",
    "version: 1",
    "kind: shape",
    "shape: { type: text, values: [mg, mcg, g] }",
    "statement: Write the amount in the unit that the label prints.",
    "reason: A grade must rest on what the label states.",
    "scope: { nodes: subtree, stages: [create_node], fields: ['attributes[].unit'] }",
    "binding: strict",
    "examples:",
    "  - { output: mg, expected: pass }",
    "  - { output: IU, expected: fail, note: IU is not a unit of mass. }",
    "provenance: { decision_row: explainer fixture 2026-11-07 }",
    "owner: skincare",
    "status: active",
]
H1 = "68be9c64347c851404759004bacabb785a59cebd9781be39c9d940e3a2a74cae"  # worked-example output
H2 = "c6b4737a26f780cc0947eaf2c482835a50675375c4dc55ab02af7d411ef0edc1"  # units.label_unit@2


def short(h):
    return f"{h[:8]}...{h[-8:]}"


KIND_COL = {"shape": C["compiler"], "code_check": C["code"], "judgement": C["judge"]}


class RulesRecord(HScene):
    key = "11_rules_record"

    def construct(self):
        self.add(heading(PART, "a rule is a form"))
        od = outline_beat(self, "rules")
        self.at("Here is the main idea")
        self.play(FadeOut(od), run_time=0.6)
        form = box("a form (data)", C["rule"], w=4.0, h=1.3, size=28)
        fn = box("a function (code)", MUTED, w=4.0, h=1.3, size=28, fill=0.04)
        VGroup(form, fn).arrange(RIGHT, buff=1.2).move_to(UP * 0.8)
        self.play(FadeIn(form), FadeIn(fn), run_time=0.8)
        self.at("A rule is a form, not a function")
        self.play(Create(cross(fn, color=C["fail"], sw=4)), run_time=0.6)
        x_mark = self.mobjects[-1]
        self.at("A rule record is one rule")
        rr = T("rule record: one rule, as a YAML file in git", size=24, color=C["rule"]).next_to(VGroup(form, fn),
                                                                                                 DOWN, buff=0.6)
        self.play(FadeIn(rr), run_time=0.6)
        self.at("A person can read it")
        acts = VGroup(*[tag(t, FG, size=20) for t in ("read it", "compare two versions", "review it in a PR")])
        acts.arrange(RIGHT, buff=0.35).next_to(rr, DOWN, buff=0.4)
        self.play(LaggedStart(*[FadeIn(a) for a in acts], lag_ratio=0.3), run_time=1.0)
        self.at("Rohan ruled that a rule")
        rul = T("a rule = an instruction (Rohan's ruling)", size=22, color=MUTED).next_to(acts, DOWN, buff=0.4)
        self.play(FadeIn(rul), run_time=0.6)

        self.at("Here is one rule record")
        self.play(FadeOut(VGroup(form, fn, x_mark, rr, acts, rul)), run_time=0.5)
        card = code_card(YAML, size=18, title="rules/skincare/units.label_unit.yaml (worked example)",
                         color=C["rule"])
        card.move_to([0, -0.45, 0])
        L = card.lines
        self.play(FadeIn(card.rect), FadeIn(card[2]), *[FadeIn(L[i]) for i in (0, 1, 2)], run_time=0.8)
        for cue, idx in [("Its statement says", [4]), ("Its reason says", [5]), ("It allows three units", [3]),
                         ("It carries two golden examples", [8]), ("Milligrams pass", [9, 10])]:
            self.at(cue)
            self.play(*[FadeIn(L[i], shift=RIGHT * 0.15) for i in idx], run_time=0.6)
        self.at("Each record also names its owner")
        self.play(*[FadeIn(L[i]) for i in (6, 7, 11, 13)], FadeIn(L[12]), L[12].animate.set_color(C["tree"]),
                  run_time=0.7)

        self.at("The owner is the node")
        tree = category_tree(levels=False).move_to([-3.4, 0.1, 0])
        own = tag("owner: skincare", C["tree"]).next_to(tree.nodes["skincare"], UP, buff=0.25)
        self.play(FadeOut(card), FadeIn(tree), FadeIn(own), run_time=0.8)
        self.play(pulse(tree.nodes["skincare"], C["rule"]), run_time=0.8)
        self.at("The file sits in the folder")
        files = code_card(["rules/", "  skincare/", ("    units.label_unit.yaml", C["rule"]), "  sunscreen/",
                           "    units.mass_only.yaml"], size=20, title="folder = owner")
        files.move_to([3.4, 0.4, 0])
        self.play(FadeIn(files), run_time=0.8)
        self.at("One rule has one owner")
        one = T("one rule, one owner: no two versions on two nodes", size=22, color=C["rule"])
        one.next_to(files, DOWN, buff=0.4)
        self.play(FadeIn(one), run_time=0.6)

        self.at("The loader is the code")
        loader = box("loader", C["code"], w=2.2, sub="reads and checks each rule file").next_to(tree, DOWN, buff=0.4)
        self.play(FadeIn(loader), run_time=0.6)
        self.at("The record schema and the loader")
        c1 = chip("BUILT", "BUILT: record schema + loader")
        c2 = chip("REAL", "rules/ in the repo: 0 rule files (verified)")
        VGroup(c1, c2).arrange(RIGHT, buff=0.4).to_edge(DOWN, buff=0.3)
        self.play(FadeIn(c1), run_time=0.5)
        self.at("The rules folder of the repo")
        self.play(FadeIn(c2), run_time=0.5)
        self.finish()


class RulesKinds(HScene):
    key = "12_rules_kinds"

    def construct(self):
        self.add(heading(PART, "three kinds of rule"))
        kind = box("kind", C["rule"], w=1.8, mono=True).move_to([0, 2.7, 0])
        self.play(FadeIn(kind), run_time=0.6)
        titles = [("shape", "the type of one output field"), ("code_check", "a check function + params"),
                  ("judgement", "one question for a judge")]
        cards = VGroup()
        for name, what in titles:
            b = box(name, KIND_COL[name], w=4.2, h=1.25, mono=True, size=22, sub=what, sub_size=20)
            cards.add(b)
        cards.arrange(RIGHT, buff=0.3).move_to([0, 0.95, 0])
        ars = VGroup(*[Arrow(kind.get_bottom(), c.get_top(), buff=0.08, color=MUTED, stroke_width=2,
                             tip_length=0.14) for c in cards])
        self.at("The kind tells the harness")
        self.play(*[GrowArrow(a) for a in ars], run_time=0.7)

        self.at("A shape rule gives the type")
        self.play(FadeIn(cards[0]), run_time=0.6)
        self.at("Examples are text from a closed list")
        ex = para(["closed-list text, bounded number,", "flag, list"], size=20, color=MUTED, gap=0.04)
        ex.next_to(cards[0], DOWN, buff=0.25)
        self.play(FadeIn(ex), run_time=0.6)
        self.at("Units label unit is a shape rule")
        e1 = M("units.label_unit", size=20, color=C["rule"]).next_to(ex, DOWN, buff=0.2)
        self.play(FadeIn(e1), run_time=0.5)

        self.at("A code check names a check function")
        self.play(FadeIn(cards[1]), run_time=0.6)
        self.at("The registry has four checks")
        reg = VGroup(*[box(n, C["code"], h=0.56, size=20, mono=True, fill=0.08)
                       for n in ("quote_in_source", "key_in_registry", "record_exists", "unique_by")])
        reg.arrange(RIGHT, buff=0.25).move_to([0, -1.95, 0])
        regt = T("the registry", size=18, color=MUTED).next_to(reg, UP, buff=0.12).align_to(reg, LEFT)
        self.play(FadeIn(regt), LaggedStart(*[FadeIn(r) for r in reg], lag_ratio=0.2), run_time=1.0)
        for cue, idx in [("One check tests that a quote", [0]), ("The other checks test", [1, 2]),
                         ("The last check tests", [3])]:
            self.at(cue)
            self.play(*[r.rect.animate.set_stroke(width=6) for r in [reg[i] for i in idx]],
                      *[pulse(reg[i], C["code"]) for i in idx], run_time=0.9)

        self.at("A judgement rule asks")
        self.play(FadeIn(cards[2]), run_time=0.6)
        self.at("An example is, does this attribute")
        q = para(["does this attribute describe", "the product itself?"], size=20, color=C["judge"], gap=0.04)
        q.next_to(cards[2], DOWN, buff=0.25)
        self.play(FadeIn(q), run_time=0.6)

        self.at("A code check decides facts only")
        facts = code_card([
            ("FactKind = substring | membership | reference | uniqueness", C["code"]),
            "CheckOutcome = pass | fail + fix | cannot_verify + why",
        ], size=18)
        facts.next_to(reg, DOWN, buff=0.35)
        self.play(FadeIn(facts), run_time=0.7)
        self.at("That is a project rule")
        never = tag("facts only: never a grade, never a match", C["fail"]).next_to(cards[1], DOWN, buff=0.3)
        self.play(FadeIn(never), run_time=0.6)
        self.at("The type of a check result has no field")
        nos = T("no score field", size=20, color=C["fail"], weight="BOLD").next_to(facts, LEFT, buff=0.25)
        self.play(FadeIn(nos), run_time=0.5)
        self.at("The three kinds and the four checks")
        c = chip("BUILT").to_corner(UR, buff=0.5)
        self.play(FadeIn(c), run_time=0.5)
        self.finish()


class RulesScope(HScene):
    key = "13_rules_scope"

    def construct(self):
        self.add(heading(PART, "scope: where a rule applies"))
        parts = [("nodes: subtree", C["tree"]), ("stages: [create_node]", C["tree"]),
                 ("fields: ['attributes[].unit']", C["compiler"])]
        pieces = VGroup(M("scope: {", size=20, color=FG))
        for i, (p, col) in enumerate(parts):
            pieces.add(M(p + ("," if i < 2 else ""), size=20, color=col))
        pieces.add(M("}", size=20))
        pieces.arrange(RIGHT, buff=0.16).move_to([0, 2.35, 0])
        self.at("Its scope says so")
        self.play(FadeIn(pieces[0]), FadeIn(pieces[-1]), run_time=0.6)
        self.at("They are the nodes")
        self.play(LaggedStart(*[FadeIn(p) for p in pieces[1:4]], lag_ratio=0.4), run_time=1.2)

        tree = category_tree(levels=True).move_to([-2.9, -0.4, 0])
        N = tree.nodes
        self.at("The nodes part counts from the owner")
        self.play(FadeIn(tree), pulse(pieces[1], C["tree"]), run_time=0.9)

        def light(names):
            return [N[n].rect.animate.set_fill(C["tree"], 0.55 if n in names else 0.08) for n in N]

        sel = VGroup(*[box(s, C["tree"], w=2.6, h=0.56, size=20, mono=True, fill=0.04)
                       for s in ("owner", "subtree", "{ level: leaf }")])
        sel.arrange(DOWN, buff=0.25).move_to([3.6, -0.3, 0])
        selt = T("the nodes part, from owner skincare", size=18, color=MUTED).next_to(sel, UP, buff=0.2)
        self.at("It selects the owner only")
        self.play(FadeIn(selt), FadeIn(sel[0]), *light({"skincare"}), run_time=0.7)
        self.wait(0.8)
        self.play(FadeIn(sel[1]), *light(set(N)), run_time=0.7)
        self.at("It can also select each node of one level")
        self.play(FadeIn(sel[2]), *light({"mineral sunscreen"}), run_time=0.7)

        self.at("A scope never names another node")
        self.play(FadeOut(VGroup(sel, selt)), *light({"sunscreen"}), run_time=0.6)
        own = tag("a rule owned by sunscreen", C["rule"]).move_to([3.4, 0.4, 0])
        self.play(FadeIn(own), run_time=0.5)
        self.at("So a sunscreen rule cannot reach")
        up = Arrow(N["sunscreen"].get_top(), N["skincare"].get_bottom() + LEFT * 0.3, buff=0.1, color=C["fail"],
                   stroke_width=4)
        side = Arrow(N["sunscreen"].get_right(), N["moisturizer"].get_left(), buff=0.1, color=C["fail"],
                     stroke_width=4)
        self.play(GrowArrow(up), GrowArrow(side), run_time=0.7)
        xs = VGroup(cross(Square(0.34).move_to(up.get_center()), sw=5),
                    cross(Square(0.34).move_to(side.get_center()), sw=5))
        self.play(Create(xs), run_time=0.6)

        self.at("For units label unit")
        self.play(FadeOut(VGroup(up, side, own, xs)), *light(set(N)), run_time=0.7)
        lab = M("units.label_unit", size=22, color=C["rule"]).move_to([3.4, 0.6, 0])
        three = para(["nodes: skincare and below", "stage: create_node", "field: attributes[].unit"], size=20)
        three.next_to(lab, DOWN, buff=0.3)
        self.play(FadeIn(lab), FadeIn(three[0]), run_time=0.7)
        self.wait(1.0)
        self.play(FadeIn(three[1]), run_time=0.5)
        self.at("That field is the unit")
        self.play(FadeIn(three[2]), pulse(pieces[3], C["compiler"]), run_time=0.9)

        self.at("Why no node names")
        self.play(FadeOut(VGroup(lab, three)), run_time=0.5)
        why = para(["a name could point at a parent or a sibling;", "a count from the owner",
                    "makes that state impossible"], size=22, color=FG)
        why.move_to([3.3, 0.0, 0])
        self.at("A name in a scope could point")
        self.play(FadeIn(why[0]), run_time=0.6)
        self.at("A count from the owner")
        self.play(FadeIn(why[1:]), run_time=0.6)
        self.at("This kind of scope exists")
        c = chip("BUILT").to_corner(UR, buff=0.5)
        self.play(FadeIn(c), run_time=0.5)
        self.finish()


class RulesInheritance(HScene):
    key = "14_rules_inheritance"

    def construct(self):
        self.add(heading(PART, "inheritance: add or tighten, never loosen"))
        par = box("parent rule", C["rule"], w=2.8).move_to([-3.5, 1.6, 0])
        chi = box("child node", C["tree"], w=2.8).move_to([-3.5, -0.2, 0])
        a = Arrow(par.get_bottom(), chi.get_top(), buff=0.08, color=C["rule"], stroke_width=3)
        self.at("Inheritance answers this")
        self.play(FadeIn(par), run_time=0.6)
        self.at("A rule can apply at each node below")
        self.play(GrowArrow(a), FadeIn(chi), run_time=0.8)
        self.at("Then a child inherits that rule")
        inh = T("inherited rules always apply", size=22, color=C["rule"]).next_to(chi, DOWN, buff=0.35)
        self.play(FadeIn(inh), run_time=0.6)

        self.at("Think of house rules")
        self.play(FadeOut(VGroup(par, chi, a, inh)), run_time=0.5)
        bld = RoundedRectangle(corner_radius=0.1, width=9.0, height=4.4, color=C["rule"], stroke_width=3)
        bld.set_fill(C["rule"], 0.04).move_to([0, -0.4, 0])
        bt = T("the building: no pets over 10 kg", size=24, color=C["rule"]).next_to(bld.get_top(), DOWN, buff=0.3)
        self.play(Create(bld), run_time=0.7)
        self.at("The building says")
        self.play(FadeIn(bt), run_time=0.6)
        fa = box("flat A: no pets at all", C["tree"], w=3.8, h=1.1, size=22).move_to([-2.2, -1.0, 0])
        fb = box("flat B: pets up to 30 kg", C["tree"], w=3.8, h=1.1, size=22).move_to([2.2, -1.0, 0])
        self.at("One flat may add")
        self.play(FadeIn(fa), run_time=0.6)
        self.at("That rule is stricter")
        ta = tick(s=0.25).next_to(fa, DOWN, buff=0.25)
        sa = T("stricter: fine", size=20, color=C["pass"]).next_to(ta, RIGHT, buff=0.15)
        self.play(Create(ta), FadeIn(sa), run_time=0.7)
        self.at("The flat may not say")
        self.play(FadeIn(fb), run_time=0.6)
        self.at("That rule is looser")
        xb = cross(Square(0.4), sw=5).next_to(fb, DOWN, buff=0.25)
        sb = T("looser: refused", size=20, color=C["fail"]).next_to(xb, RIGHT, buff=0.15)
        self.play(Create(xb), FadeIn(sb), run_time=0.7)

        self.at("CSS and ESLint do not work")
        house = VGroup(bld, bt, fa, fb, ta, sa, xb, sb)
        self.play(FadeOut(house), run_time=0.5)
        css = code_card([".sunscreen { unit: IU }   /* nearer rule wins */"], size=20, title="CSS, ESLint")
        hr = code_card([("each rule in scope applies: rule A AND rule B", C["rule"])], size=20, title="the harness")
        VGroup(css, hr).arrange(DOWN, buff=0.6, aligned_edge=LEFT).move_to([0, 0.7, 0])
        self.play(FadeIn(css), run_time=0.6)
        self.at("There, the nearer rule wins")
        loos = T("the nearer rule may loosen the parent", size=20, color=C["fail"]).next_to(css, RIGHT, buff=0.3)
        if loos.get_right()[0] > 6.9:
            loos.next_to(css, DOWN, buff=0.12).align_to(css, LEFT)
        self.play(FadeIn(loos), run_time=0.6)
        self.at("Here, a child rule may only add")
        self.play(FadeIn(hr), run_time=0.6)
        self.at("To loosen a rule, change it")
        lo = T("to loosen: a new version, at the owner", size=22, color=MUTED).next_to(hr, DOWN, buff=0.4)
        self.play(FadeIn(lo), run_time=0.6)

        self.at("In the worked example")
        self.play(FadeOut(VGroup(css, loos, hr, lo)), run_time=0.5)
        sk = box("skincare", C["tree"], w=2.4).move_to([-4.0, 1.0, 0])
        su = box("sunscreen", C["tree"], w=2.4).move_to([-4.0, -1.0, 0])
        e = Line(sk.get_bottom(), su.get_top(), color=C["tree"], stroke_width=3)
        outer = strip(["mg", "mcg", "g"], C["rule"], "units.label_unit@1").next_to(sk, RIGHT, buff=0.8)
        inner = strip(["mg"], C["rule"], "units.mass_only@1").next_to(su, RIGHT, buff=0.8)
        inner.align_to(outer, LEFT)
        self.play(FadeIn(sk), FadeIn(su), Create(e), FadeIn(outer), run_time=0.9)
        self.play(FadeIn(inner), run_time=0.6)
        self.at("That rule is stricter than its parent")
        inside = T("[mg] sits inside [mg, mcg, g]: accepted", size=22, color=C["pass"]).next_to(inner, DOWN, buff=0.4)
        inside.align_to(inner, LEFT)
        self.play(FadeIn(inside), run_time=0.6)
        self.finish()


def strip(values, color, label):
    cells = VGroup(*[box(v, color, w=1.1, h=0.6, size=22, mono=True, fill=0.12) for v in values])
    cells.arrange(RIGHT, buff=0.08)
    lab = M(label, size=18, color=MUTED).next_to(cells, UP, buff=0.12).align_to(cells, LEFT)
    return VGroup(cells, lab)


class RulesBinding(HScene):
    key = "15_rules_binding"

    def construct(self):
        self.add(heading(PART, "binding: what a fail does"))
        fail = box("check: fail", C["fail"], w=2.4, h=0.9).move_to([-4.8, 0.2, 0])
        self.play(FadeIn(fail), run_time=0.6)
        names = [("strict", "a barrier", "back to the drafter, with the errors", C["fail"]),
                 ("soft", "a warning light", "output kept, with a warning", C["rule"]),
                 ("watch", "a camera", "logs the result, nothing else", C["cv"])]
        rows = VGroup()
        for n, sign, effect, col in names:
            b = box(n, col, w=1.7, h=0.7, mono=True)
            s = T(sign, size=20, color=MUTED)
            e = T(effect, size=22, color=FG)
            rows.add(VGroup(b, s, e))
        for i, r in enumerate(rows):
            y = 1.5 - i * 1.3
            r[0].move_to([-1.2, y, 0])
            r[1].next_to(r[0], DOWN, buff=0.1)
            r[2].next_to(r[0], RIGHT, buff=0.5)
        ars = VGroup(*[Arrow(fail.get_right(), r[0].get_left(), buff=0.08, color=MUTED, stroke_width=3,
                             tip_length=0.16) for r in rows])
        self.at("A binding is strict, soft, or watch")
        self.play(*[GrowArrow(a) for a in ars], LaggedStart(*[FadeIn(r[0]) for r in rows], lag_ratio=0.3),
                  run_time=1.2)
        self.at("Think of three road signs")
        self.play(*[FadeIn(r[1]) for r in rows], run_time=0.7)
        for cue, i in [("Strict is a barrier", 0), ("Soft is a warning light", 1), ("Watch is a camera", 2)]:
            self.at(cue)
            self.play(FadeIn(rows[i][2], shift=LEFT * 0.2), ars[i].animate.set_color(names[i][3]), run_time=0.7)
        self.at("The rule text stays the same")
        same = T("the rule text stays the same; only the binding changes what a fail does", size=20,
                 color=MUTED).to_edge(DOWN, buff=1.3)
        self.play(FadeIn(same), run_time=0.6)
        self.at("Two details matter")
        self.play(FadeOut(same), run_time=0.4)
        n1 = tag("shape rule: always strict (the loader refuses another binding)", C["compiler"], size=20)
        n2 = tag("watch: never printed, never in the schema", C["cv"], size=20)
        notes = VGroup(n1, n2).arrange(DOWN, buff=0.2, aligned_edge=LEFT).to_edge(DOWN, buff=0.95)
        self.at("Each shape rule is always strict")
        self.play(FadeIn(n1), run_time=0.6)
        self.at("And a watch rule never prints")
        self.play(FadeIn(n2), run_time=0.6)
        self.at("The binding field exists")
        c1 = chip("BUILT", "BUILT: the binding field")
        c2 = chip("DESIGN", "DESIGN: the run-time effect (plan.judge_step)")
        VGroup(c1, c2).arrange(RIGHT, buff=0.4).to_edge(DOWN, buff=0.3)
        self.play(FadeIn(c1), run_time=0.5)
        self.at("The judge part of a stage")
        self.play(FadeIn(c2), run_time=0.5)
        self.finish()


class RulesHash(HScene):
    key = "16_rules_hash"

    def construct(self):
        self.add(heading(PART, "the rule hash"))
        rec = box("rule record", C["rule"], w=2.6, h=0.9).move_to([-5.0, 1.4, 0])
        js = box("JSON, sorted keys", C["compiler"], w=3.0, h=0.9, sub="RFC 8785").move_to([-1.3, 1.4, 0])
        sha = box("sha256", C["compiler"], w=1.9, h=0.9, mono=True).move_to([1.7, 1.4, 0])
        st = M(short(H1), size=22, color=C["rule"]).move_to([4.75, 1.4, 0])
        ars = VGroup(link(rec, js), link(js, sha), link(sha, st))
        self.at("It computes a hash")
        self.play(FadeIn(rec), run_time=0.5)
        self.at("A hash is a fingerprint")
        self.play(GrowArrow(ars[1]), FadeIn(sha), GrowArrow(ars[2]), FadeIn(st), run_time=0.9)
        self.at("The same content always")
        same = code_card([("units.label_unit@1          " + short(H1), FG),
                          ("new words, as version 2    " + short(H2), C["rule"])], size=20,
                         title="one changed word, another hash (worked example)")
        same.move_to([0, -0.2, 0])
        self.play(FadeIn(same), run_time=0.8)
        self.at("The harness first writes the rule")
        self.play(GrowArrow(ars[0]), FadeIn(js), FadeOut(same), run_time=0.8)
        self.at("The hash covers what the rule asks")
        groups = [("what it asks", ["statement", "reason", "kind", "judge"]),
                  ("how it is checked", ["shape", "check", "binding", "examples"]),
                  ("where it applies", ["scope", "owner"])]
        cols = VGroup()
        for title, fields in groups:
            t = T(title, size=20, color=C["rule"])
            fs = VGroup(*[SM(f, size=20) for f in fields]).arrange(DOWN, aligned_edge=LEFT, buff=0.06)
            cols.add(VGroup(t, fs).arrange(DOWN, aligned_edge=LEFT, buff=0.2))
        cols.arrange(RIGHT, buff=0.8, aligned_edge=UP).move_to([-1.6, -1.2, 0])
        self.play(LaggedStart(*[FadeIn(c) for c in cols], lag_ratio=0.4), run_time=1.5)
        self.at("It leaves out the id")
        out = VGroup(T("left out", size=20, color=MUTED),
                     *[SM(f, size=20, color=MUTED) for f in ("id", "version", "status", "provenance", "supersedes")])
        out.arrange(DOWN, aligned_edge=LEFT, buff=0.06).next_to(cols, RIGHT, buff=1.0).align_to(cols, UP)
        strikes = VGroup(*[Line(m.get_left(), [m.get_left()[0] + vis_width(m), m.get_y(), 0], color=MUTED,
                                stroke_width=2) for m in out[1:]])
        self.play(FadeIn(out), Create(strikes), run_time=0.7)
        self.at("The rule hash exists in code")
        c = chip("BUILT", "BUILT: src/rules/hash.ts").to_corner(DR, buff=0.4)
        self.play(FadeIn(c), run_time=0.5)
        self.finish()
