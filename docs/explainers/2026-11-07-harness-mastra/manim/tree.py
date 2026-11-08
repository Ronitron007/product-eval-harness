"""Part part.tree: the category tree and its stages."""
from manim import *

from style import *
from timing import HScene

PART = "part.tree: the category tree and its stages"


class TreeStages(HScene):
    key = "08_tree_stages"

    def construct(self):
        self.add(heading(PART, "nodes and stages"))
        od = outline_beat(self, "tree", "compiler")
        self.at("The harness keeps one node")
        self.play(FadeOut(od), run_time=0.6)
        tree = category_tree().move_to([-3.6, 0.4, 0])
        self.play(FadeIn(tree), run_time=1.0)

        self.at("A stage does")
        st = tag("stage = one kind of work at one node", C["tree"], size=22).move_to([3.3, 2.3, 0])
        self.play(FadeIn(st), run_time=0.6)
        self.at("Think of one station")
        names = [("define_criteria", "domain"), ("create_node", "inner, leaf"), ("create_pack", "leaf"),
                 ("create_layout", "leaf")]
        stations = VGroup()
        for n, lv in names:
            b = box(n, C["tree"], w=3.3, h=0.62, size=20, mono=True)
            l = T(lv, size=20, color=MUTED)
            stations.add(VGroup(b, l).arrange(RIGHT, buff=0.3))
        for s in stations:
            s[1].align_to(stations[0][1], LEFT)
        stations.arrange(DOWN, buff=0.28, aligned_edge=LEFT).move_to([3.3, 0.2, 0])
        belt = Line(stations.get_corner(UL) + LEFT * 0.35, stations.get_corner(DL) + LEFT * 0.35,
                    color=MUTED, stroke_width=4)
        line_t = T("a production line: same cycle, only the product changes", size=20, color=MUTED)
        line_t.next_to(stations, DOWN, buff=0.35)
        self.play(Create(belt), FadeIn(stations[0][0]), run_time=0.8)
        self.at("Only the product changes")
        self.play(FadeIn(line_t), run_time=0.6)

        self.at("The design has four stages")
        self.play(LaggedStart(*[FadeIn(s[0]) for s in stations[1:]], lag_ratio=0.3), run_time=1.0)
        self.at("Define criteria runs at a domain node")
        self.play(FadeIn(stations[0][1]), pulse(tree.nodes["skincare"], C["tree"]), run_time=1.0)
        self.at("A criterion is one aspect")
        crit = panel(para(["criterion: one aspect a grade looks at", "(for example, ingredient safety)"], size=20),
                     color=C["tree"])
        crit.next_to(tree, DOWN, buff=0.35)
        self.play(FadeOut(line_t), FadeIn(crit), run_time=0.7)
        self.at("Only a domain node makes criteria")
        only = T("only the domain makes criteria", size=20, color=C["tree"]).next_to(tree.nodes["skincare"], UP,
                                                                                     buff=0.2)
        self.play(FadeIn(only), run_time=0.6)
        self.at("Create node runs at an inner node")
        self.play(FadeIn(stations[1][1]), pulse(VGroup(tree.nodes["sunscreen"], tree.nodes["moisturizer"],
                                                       tree.nodes["mineral sunscreen"]), C["tree"]), run_time=1.0)
        self.at("At a leaf, two more stages")
        self.play(FadeIn(stations[2][1]), FadeIn(stations[3][1]), pulse(tree.nodes["mineral sunscreen"], C["tree"]),
                  run_time=1.0)
        gr = VGroup(T("grading rules", size=18, color=MUTED).next_to(stations[2], RIGHT, buff=0.2),
                    T("display rules", size=18, color=MUTED).next_to(stations[3], RIGHT, buff=0.2))
        self.play(FadeIn(gr), run_time=0.5)

        self.at("The code already holds this table")
        self.play(FadeOut(VGroup(stations, belt, gr, st, crit, only)), run_time=0.5)
        code = code_card([
            "export const STAGE_LEVELS = {",
            "  define_criteria: ['domain'],",
            "  create_node: ['inner', 'leaf'],",
            "  create_pack: ['leaf'],",
            "  create_layout: ['leaf'],",
            ("  evaluate_product: ['leaf'], // inferred", MUTED),
            "}",
        ], size=18, title="src/rules/schema.ts (real)")
        code.move_to([3.1, 0.4, 0])
        self.play(FadeIn(code.rect), FadeIn(code[2]),
                  LaggedStart(*[FadeIn(l) for l in [*code.lines[:5], code.lines[6]]], lag_ratio=0.15), run_time=1.4)
        self.at("It also lists evaluate product")
        self.play(FadeIn(code.lines[5]), run_time=0.6)
        self.at("That entry is the product evaluation")
        out = T("the product evaluation: outside the stages", size=20, color=MUTED).next_to(code, DOWN, buff=0.3)
        self.play(FadeIn(out), run_time=0.6)
        self.at("It refuses a stage at a level")
        ref = code_card([("The stage create_pack never runs at level inner.", C["fail"])], size=18)
        ref.next_to(out, DOWN, buff=0.3).to_edge(RIGHT, buff=0.3)
        self.play(FadeIn(ref), run_time=0.6)
        self.at("The stages themselves are a design")
        chips = VGroup(chip("BUILT", "BUILT: the table"), chip("DESIGN", "DESIGN: the stages")).arrange(RIGHT, buff=0.4)
        chips.next_to(tree, DOWN, buff=0.5)
        self.play(FadeIn(chips), run_time=0.6)
        self.finish()


class TreeStageCycle(HScene):
    key = "09_tree_stage_cycle"

    def construct(self):
        self.add(heading(PART, "one stage run: the cycle"))
        y = 1.6
        ctx = box("context", C["tree"], w=2.0).move_to([-5.6, y, 0])
        res = box("research", C["tree"], w=2.0).move_to([-3.2, y, 0])
        drf = box("draft", C["model"], w=1.8).move_to([-0.9, y, 0])
        dia = Polygon(UP * 0.55, RIGHT * 0.8, DOWN * 0.55, LEFT * 0.8, color=C["judge"], stroke_width=3)
        dia.set_fill(C["judge"], 0.14)
        judge = VGroup(dia, T("judge", size=20)).move_to([1.4, y, 0])
        rep = box("repair", C["model"], w=1.8, h=0.56, size=20).move_to([4.0, y + 0.85, 0])
        per = box("person", C["person"], w=1.8, h=0.56, size=20).move_to([4.0, y, 0])
        acc = box("accept", C["pass"], w=1.8, h=0.56, size=20).move_to([4.0, y - 0.85, 0])
        row = [ctx, res, drf, judge]
        ars = VGroup(*[link(a, b) for a, b in zip(row[:-1], row[1:])])
        self.play(FadeIn(ctx), run_time=0.6)
        self.at("Context reads the path")
        n1 = para(["path to the root,", "criteria + rules,", "past research,", "sibling nodes"], size=18,
                  color=MUTED, gap=0.04).next_to(ctx, DOWN, buff=0.25)
        self.play(FadeIn(n1), run_time=0.7)
        self.at("Research searches the web")
        n2 = para(["web +", "past work"], size=18, color=MUTED, gap=0.04).next_to(res, DOWN, buff=0.25)
        self.play(GrowArrow(ars[0]), FadeIn(res), FadeIn(n2), run_time=0.8)
        self.at("Draft makes one output")
        n3 = para(["one output in", "the rules' shape"], size=18, color=MUTED, gap=0.04).next_to(drf, DOWN, buff=0.25)
        self.play(GrowArrow(ars[1]), FadeIn(drf), FadeIn(n3), run_time=0.8)
        self.at("In the worked example")
        att = panel(para(["attribute: one measurable property", "(the zinc oxide amount on the label)",
                          "values: number + unit, word, list of words, flag"], size=20), color=C["model"])
        att.move_to([-2.6, -1.5, 0])
        self.play(FadeIn(att), run_time=0.7)
        self.at("Judge checks each rule")
        self.play(GrowArrow(ars[2]), FadeIn(judge), run_time=0.7)

        self.at("If a rule fails")
        a_rep = Arrow(dia.get_right(), rep.get_left(), buff=0.06, color=MUTED, stroke_width=3)
        back = elbow([rep.get_top(), [4.0, y + 1.45, 0], [-0.9, y + 1.45, 0], drf.get_top()], color=C["model"])
        cnt = VGroup(*[M(t, size=18, color=C["model"]) for t in ("1/3", "2/3", "3/3")]).arrange(RIGHT, buff=0.25)
        cnt.next_to(rep, RIGHT, buff=0.2)
        self.play(FadeOut(att), GrowArrow(a_rep), FadeIn(rep), Create(back), run_time=1.0)
        self.play(LaggedStart(*[FadeIn(c) for c in cnt], lag_ratio=0.5), run_time=1.2)
        self.at("When the rules pass")
        a_acc = Arrow(dia.get_right(), acc.get_left(), buff=0.06, color=MUTED, stroke_width=3)
        self.play(GrowArrow(a_acc), FadeIn(acc), run_time=0.7)
        self.at("When the tries run out")
        a_per = Arrow(dia.get_right(), per.get_left(), buff=0.06, color=MUTED, stroke_width=3)
        self.play(GrowArrow(a_per), FadeIn(per), run_time=0.7)

        self.at("To accept means to write")
        db = cylinder("graph store", w=2.6, h=1.0, size=22).move_to([4.0, -0.9, 0])
        a_db = Arrow(acc.get_bottom(), db.get_top() + UP * 0.1, buff=0.06, color=C["pass"], stroke_width=3)
        self.play(GrowArrow(a_db), FadeIn(db), run_time=0.8)
        self.at("The graph store is the set")
        pg = T("harness tables in Postgres", size=20, color=MUTED).next_to(db, DOWN, buff=0.2)
        self.play(FadeIn(pg), run_time=0.5)
        self.at("It holds the nodes")
        tables = code_card(["nodes", "stage_runs", "outputs", "verdicts", "records", "derived_rules"], size=20,
                           title="src/store/schema.ts (real)", color=C["store"])
        tables.next_to(db, LEFT, buff=0.7).align_to(db, UP)
        self.play(FadeIn(tables.rect), FadeIn(tables[2]),
                  LaggedStart(*[FadeIn(l) for l in tables.lines], lag_ratio=0.3), run_time=2.0)
        self.at("Rows only grow")
        log = tag("append-only: rows only grow", C["store"]).next_to(db, DOWN, buff=0.7)
        self.play(FadeIn(log), run_time=0.6)
        self.at("The graph store exists in code")
        c1 = chip("BUILT", "BUILT: graph store").to_corner(DL, buff=0.5)
        self.play(FadeIn(c1), run_time=0.5)
        self.at("The cycle is a design")
        c2 = chip("DESIGN", "DESIGN: the cycle").next_to(c1, RIGHT, buff=0.4)
        self.play(FadeIn(c2), run_time=0.5)
        self.finish()


class TreeOnMastra(HScene):
    key = "10_tree_on_mastra"

    def construct(self):
        self.add(heading(PART, "a stage on Mastra"))
        tb = table(["stage, in the design", "Mastra part"], [
            ["stage", ("createWorkflow", C["mastra"])],
            ["context, research, accept", ("createStep", C["mastra"])],
            ["draft + judge", ("nested workflow", C["mastra"])],
            ["repair", (".dountil(draftAndJudge,\n  errors.length === 0 || iterationCount >= 3)", C["mastra"])],
            ["person", ("suspend / resume / bail", C["mastra"])],
            ["drafter", ("Agent + structuredOutput", C["mastra"])],
            ["each rule check", ("createScorer", C["mastra"])],
        ], [4.2, 8.2], size=20, mono_cols=(1,))
        tb.move_to(DOWN * 0.25)
        self.at("Here is the map")
        self.play(FadeIn(tb[0]), run_time=0.6)
        cues = ["Each stage is one workflow", "Context, research, draft", "The draft and the judge sit",
                "A Mastra loop step repeats", "The person step suspends", "The drafter is an agent",
                "Each rule check is a Mastra scorer"]
        for i, cue in enumerate(cues):
            self.at(cue)
            self.play(FadeIn(tb[i + 1], shift=UP * 0.1), run_time=0.6)
        self.at("A new rule changes the data")
        note = T("a new rule changes the data, never the shape of the workflow", size=20, color=C["rule"])
        note.to_edge(DOWN, buff=0.55)
        self.play(FadeIn(note), run_time=0.6)
        self.at("This whole map is a design")
        c = chip("DESIGN").to_corner(UR, buff=0.5)
        self.play(FadeIn(c), run_time=0.5)
        self.at("A research run type-checked")
        foot = T("sketch type-checked: docs/research/2026-10-24-mastra-probes/10-stage-workflow.ts, exit 0", size=18,
                 color=MUTED).to_edge(DOWN, buff=0.2)
        self.play(FadeIn(foot), run_time=0.6)
        self.finish()
