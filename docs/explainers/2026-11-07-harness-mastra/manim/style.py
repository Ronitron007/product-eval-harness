"""Look of the harness explainer: colours, text, boxes, tables, chips, and the outline anchor.

One fixed colour per concept (see C). Text is never smaller than MIN_FONT (about 20 px tall at 720p).
"""
from manim import (
    DOWN, LEFT, ORIGIN, RIGHT, UP, UL, UR, DL, DR,
    Animation, AnimationGroup, Arrow, Circumscribe, Circle, CurvedArrow, DashedLine, DashedVMobject, Ellipse, FadeIn, Line,
    Polygon, Rectangle, RoundedRectangle, Text, VGroup, VMobject, config,
)
import numpy as np

BG = "#0E1116"
FG = "#E8E6E3"
MUTED = "#8B949E"
FAINT = "#3A414A"
PANEL = "#161B22"
EDGE = "#30363D"

# One fixed colour per concept, for the whole video.
C = {
    "rule": "#F2B134",      # rule records, rules/ in git
    "compiler": "#4FA3F7",  # the compiler and what it makes
    "model": "#C792EA",     # the drafter model, its drafts
    "code": "#2EC4B6",      # code checks and code scorers
    "judge": "#FF8A50",     # judge models and judge scorers
    "person": "#F06292",    # the person step, reviewers
    "store": "#B0BEC5",     # the graph store, databases
    "mastra": "#7986CB",    # Mastra parts (step, workflow, scorer)
    "tree": "#A1887F",      # the category tree, nodes, stages
    "pass": "#5CC971",
    "fail": "#EF5350",
    "cv": "#9E9E9E",        # cannot verify
}
STATUS = {
    "BUILT": "#5CC971",
    "DESIGN": "#9E9E9E",
    "ILLUSTRATIVE": "#C792EA",
    "REAL": "#E8E6E3",
    "OPEN": "#F2B134",
}

SANS = "Helvetica Neue"
MONO = "Menlo"
MIN_FONT = 18  # Text("Hg", font_size=18) is 20.8 px tall at 720p

config.background_color = BG
FRAME_W = config.frame_width   # 14.22
FRAME_H = config.frame_height  # 8.0


def T(s, size=24, color=FG, weight="NORMAL", font=SANS, **kw):
    assert size >= MIN_FONT, f"font {size} < {MIN_FONT}: {s!r}"
    return Text(s, font_size=size, color=color, weight=weight, font=font, **kw)


def M(s, size=20, color=FG, **kw):
    return T(s, size=size, color=color, font=MONO, **kw)


def S(s, size=24, color=FG, font=SANS, **kw):
    """A line with even vertical metrics: an invisible "Hg" at its end, so stacked lines keep one pitch."""
    t = T(s + " Hg", size=size, color=color, font=font, **kw)
    t.submobjects[-1].set_opacity(0)
    t.submobjects[-2].set_opacity(0)
    t._strut = True
    return t


def vis_width(t):
    return VGroup(*t.submobjects[:-2]).width if getattr(t, "_strut", False) else t.width


def SM(s, size=20, color=FG, **kw):
    return S(s, size=size, color=color, font=MONO, **kw)


def para(lines, size=24, color=FG, gap=0.16, font=SANS, align=LEFT):
    group = VGroup(*[S(l, size=size, color=color, font=font) if isinstance(l, str) else l for l in lines])
    group.arrange(DOWN, aligned_edge=align, buff=gap)
    return group


def box(label, color, w=None, h=0.72, size=22, fill=0.14, mono=False, pad=0.36, sub=None, sub_size=18):
    """A rounded box with a centred label (and an optional muted second line)."""
    lab = (M if mono else T)(label, size=size, color=FG)
    content = lab
    if sub:
        s = T(sub, size=sub_size, color=MUTED)
        content = VGroup(lab, s).arrange(DOWN, buff=0.08)
        h = max(h, content.height + 0.28)
    width = max(w or 0, content.width + pad)
    rect = RoundedRectangle(corner_radius=0.1, width=width, height=h, color=color, stroke_width=3)
    rect.set_fill(color, opacity=fill)
    content.move_to(rect)
    g = VGroup(rect, content)
    g.rect, g.label = rect, content
    return g


def cylinder(label, color=C["store"], w=2.4, h=1.2, size=22, sub=None):
    body = Rectangle(width=w, height=h, stroke_width=0).set_fill(color, 0.14)
    top = Ellipse(width=w, height=0.36, color=color, stroke_width=3).set_fill(PANEL, 1).move_to(body.get_top())
    bottom = Ellipse(width=w, height=0.36, color=color, stroke_width=3).move_to(body.get_bottom())
    sides = VGroup(Line(body.get_corner(UL), body.get_corner(DL)), Line(body.get_corner(UR), body.get_corner(DR)))
    sides.set_stroke(color, 3)
    lab = T(label, size=size)
    if sub:
        lab = VGroup(lab, T(sub, size=18, color=MUTED)).arrange(DOWN, buff=0.06)
    lab.move_to(body).shift(DOWN * 0.08)
    g = VGroup(body, bottom, sides, top, lab)
    g.rect, g.label = body, lab
    return g


def chip(kind, text=None, size=18):
    """Status chip: BUILT, DESIGN, ILLUSTRATIVE, REAL, OPEN."""
    color = STATUS[kind]
    lab = T(text or kind, size=size, color=color, weight="BOLD")
    rect = RoundedRectangle(corner_radius=0.16, width=lab.width + 0.36, height=lab.height + 0.22,
                            color=color, stroke_width=2).set_fill(color, 0.1)
    lab.move_to(rect)
    return VGroup(rect, lab)


def tag(text, color=MUTED, size=18):
    lab = T(text, size=size, color=color)
    rect = RoundedRectangle(corner_radius=0.08, width=lab.width + 0.28, height=lab.height + 0.2,
                            color=color, stroke_width=1.5).set_fill(PANEL, 0.9)
    lab.move_to(rect)
    return VGroup(rect, lab)


def panel(content, color=EDGE, pad=0.26, title=None, title_color=MUTED):
    """A dark card around content, with an optional small title above it."""
    rect = RoundedRectangle(corner_radius=0.1, width=content.width + 2 * pad, height=content.height + 2 * pad,
                            color=color, stroke_width=2).set_fill(PANEL, 0.96)
    rect.move_to(content)
    g = VGroup(rect, content)
    if title:
        t = T(title, size=18, color=title_color)
        t.next_to(rect, UP, buff=0.08, aligned_edge=LEFT)
        g.add(t)
    g.rect = rect
    return g


def code_card(lines, size=18, title=None, color=EDGE, width=None, gap=0.1):
    """Monospace lines in a card. lines: str or (str, colour). card.lines reveals row by row."""
    rows, leads = VGroup(), []
    for l in lines:
        s, col = (l, FG) if isinstance(l, str) else l
        leads.append(len(s) - len(s.lstrip(" ")))
        rows.add(SM(s.lstrip(" "), size=size, color=col))
    rows.arrange(DOWN, aligned_edge=LEFT, buff=gap)
    for r, n in zip(rows, leads):
        r.shift(RIGHT * n * 0.00795 * size)
    card = panel(rows, color=color, title=title)
    if width and card.rect.width < width:
        card.rect.stretch_to_fit_width(width).align_to(rows, LEFT).shift(LEFT * 0.26)
    card.lines = rows
    return card


def table(header, rows, widths, size=20, colors=None, mono_cols=(), row_h=None, header_color=MUTED):
    """A table as a VGroup of rows (row 0 = header). Each row: VGroup of cell texts plus a rule line.

    rows: list of lists of str, or of (str, colour). widths: column widths in units.
    """
    out = VGroup()
    all_rows = [header] + rows
    x0 = -sum(widths) / 2
    y = 0
    for ri, row in enumerate(all_rows):
        cells = VGroup()
        for ci, cell in enumerate(row):
            s, col = (cell, FG) if isinstance(cell, str) else cell
            if ri == 0:
                col = header_color
            maker = SM if ci in mono_cols and ri > 0 else S
            lines = s.split("\n")
            t = para([maker(x, size=size, color=col) for x in lines], gap=0.06) if len(lines) > 1 else maker(s, size=size, color=col)
            if vis_width(t) > widths[ci] - 0.15:
                raise ValueError(f"cell too wide ({vis_width(t):.2f} > {widths[ci] - 0.15:.2f}): {s!r}")
            cells.add(t)
        h = row_h or (max(c.height for c in cells) + 0.3)
        for ci, t in enumerate(cells):
            t.move_to([x0 + sum(widths[:ci]) + 0.1 + t.width / 2, y - h / 2, 0])
        sep = Line([x0, y - h, 0], [x0 + sum(widths), y - h, 0], stroke_width=1.5 if ri else 2.5,
                   color=FAINT if ri else MUTED)
        r = VGroup(cells, sep)
        r.cells = cells
        out.add(r)
        y -= h
    out.move_to(ORIGIN)
    return out


def arrow(a, b, color=MUTED, buff=0.08, sw=3, tip=0.18):
    p = a.get_center() if hasattr(a, "get_center") else np.array(a)
    q = b.get_center() if hasattr(b, "get_center") else np.array(b)
    return Arrow(p, q, buff=buff, color=color, stroke_width=sw, tip_length=tip,
                 max_tip_length_to_length_ratio=0.35, max_stroke_width_to_length_ratio=12)


def link(a, b, color=MUTED, sw=3, tip=0.18, side=None):
    """Arrow from the edge of a to the edge of b (side: 'h' or 'v' forces the pair of edges)."""
    ca, cb = a.get_center(), b.get_center()
    d = cb - ca
    if side == "h" or (side is None and abs(d[0]) >= abs(d[1])):
        p = a.get_right() if d[0] > 0 else a.get_left()
        q = b.get_left() if d[0] > 0 else b.get_right()
    else:
        p = a.get_bottom() if d[1] < 0 else a.get_top()
        q = b.get_top() if d[1] < 0 else b.get_bottom()
    return Arrow(p, q, buff=0.06, color=color, stroke_width=sw, tip_length=tip,
                 max_tip_length_to_length_ratio=0.4, max_stroke_width_to_length_ratio=12)


def elbow(points, color=MUTED, sw=3, dashed=False, tip=True):
    """A polyline through points, with an arrow tip at the end."""
    path = VMobject(stroke_color=color, stroke_width=sw)
    path.set_points_as_corners([np.array(p, dtype=float) for p in points])
    g = VGroup(DashedVMobject(path, num_dashes=40) if dashed else path)
    if tip:
        a = Arrow(np.array(points[-2], dtype=float), np.array(points[-1], dtype=float), buff=0,
                  color=color, stroke_width=sw, tip_length=0.18, max_tip_length_to_length_ratio=1)
        g.add(a.tip.copy() if hasattr(a, "tip") else a)
    return g


def cross(mob, color=C["fail"], sw=6):
    return VGroup(Line(mob.get_corner(UL), mob.get_corner(DR)), Line(mob.get_corner(DL), mob.get_corner(UR))).set_stroke(color, sw)


def tick(color=C["pass"], s=0.3):
    return VMobject(stroke_color=color, stroke_width=7).set_points_as_corners(
        [[-s, 0, 0], [-s / 3, -s * 0.7, 0], [s, s * 0.7, 0]])


def strike(mob, color=C["fail"], sw=4):
    return Line(mob.get_left() + LEFT * 0.05, mob.get_right() + RIGHT * 0.05, color=color, stroke_width=sw)


def heading(part, title):
    """Top-left: the part name (muted) over the scene title."""
    p = T(part, size=18, color=MUTED)
    t = T(title, size=32, weight="BOLD")
    g = VGroup(p, t).arrange(DOWN, aligned_edge=LEFT, buff=0.08)
    g.to_corner(UL, buff=0.4)
    return g


def legend_row(items, size=18):
    """items: (colour, text). A row of colour dots with labels."""
    g = VGroup()
    for col, s in items:
        d = Circle(radius=0.09, color=col, stroke_width=0).set_fill(col, 1)
        g.add(VGroup(d, T(s, size=size, color=MUTED)).arrange(RIGHT, buff=0.12))
    return g.arrange(RIGHT, buff=0.4)


def pulse(mob, color=FG):
    """Draw attention to a mobject without recolouring its fill."""
    return Circumscribe(mob, color=color, buff=0.08, stroke_width=3)


def verdict_color(v):
    return {"pass": C["pass"], "fail": C["fail"], "cannot_verify": C["cv"], "FAIL": C["fail"]}.get(v, FG)


# ---------------------------------------------------------------- dimming

def remember(mob):
    """Store each part's own stroke and fill opacity, so Level can scale from it."""
    for sm in mob.family_members_with_points():
        sm._base_op = (sm.get_stroke_opacity(), sm.get_fill_opacity())
    return mob


class Level(Animation):
    """Fade a mobject to `level` times its remembered opacities (1 = as built)."""

    def __init__(self, mob, level, **kw):
        if not all(hasattr(sm, "_base_op") for sm in mob.family_members_with_points()):
            remember(mob)
        self.targets = []
        for sm in mob.family_members_with_points():
            cur = (sm.get_stroke_opacity(), sm.get_fill_opacity())
            self.targets.append((sm, cur, (sm._base_op[0] * level, sm._base_op[1] * level)))
        super().__init__(mob, **kw)

    def interpolate_mobject(self, alpha):
        a = self.rate_func(alpha)
        for sm, c, t in self.targets:
            sm.set_stroke(opacity=c[0] + (t[0] - c[0]) * a, family=False)
            sm.set_fill(opacity=c[1] + (t[1] - c[1]) * a, family=False)


# ---------------------------------------------------------------- the outline anchor

class OutlineDiagram(VGroup):
    """The whole path on one picture. Named parts: od.parts[name]. Arrows: od.links."""

    def __init__(self):
        super().__init__()
        P = {}
        P["rules"] = box("rules/", C["rule"], w=2.3, sub="YAML in git")
        P["compiler"] = box("compiler", C["compiler"], w=2.0)
        P["tree"] = box("tree node + stage", C["tree"], h=0.56, size=18, w=2.4)
        outs = ["instructions", "schema", "scorers", "rule-set hash"]
        for o in outs:
            P[o] = box(o, C["compiler"], w=2.3, h=0.46, size=18, fill=0.08)
        P["drafter"] = box("drafter", C["model"], w=2.2, sub="agent")
        P["decode"] = box("decode gate", C["code"], size=20)
        P["code"] = box("code scorers", C["code"], size=20)
        P["judges"] = box("judges", C["judge"], size=20)
        P["verdicts"] = box("verdict rows", FG, size=20)
        P["bindings"] = box("bindings", FG, size=20)
        P["repair"] = box("repair", C["model"], w=1.7, h=0.5, size=18)
        P["person"] = box("person", C["person"], w=1.7, h=0.5, size=18)
        P["accept"] = box("accept", C["pass"], w=1.7, h=0.5, size=18)
        P["store"] = cylinder("graph store", w=2.1, h=0.7, size=18)
        P["mastra"] = box("Mastra: workflow, steps, agent, scorers, storage", C["mastra"], w=11.4, h=0.46,
                          size=18, fill=0.06)
        P["change"] = box("rule change: new version, trial, Rohan's yes", MUTED, w=6.2, h=0.46, size=18, fill=0.03)
        P["outside"] = T("outside this video", size=18, color=MUTED)

        y1, y2 = 1.55, -0.95
        P["rules"].move_to([-5.55, y1, 0])
        P["compiler"].move_to([-2.75, y1, 0])
        P["tree"].move_to([-2.75, 2.75, 0])
        for i, o in enumerate(outs):
            P[o].move_to([0.25, 2.35 - i * 0.55, 0])
        P["drafter"].move_to([3.55, y1, 0])
        row2 = ["decode", "code", "judges", "verdicts", "bindings"]
        x, x_end = -6.6, 3.5
        gap = (x_end - x - sum(P[n].width for n in row2)) / (len(row2) - 1)
        for name in row2:
            P[name].move_to([x + P[name].width / 2, y2, 0])
            x += P[name].width + gap
        P["repair"].move_to([5.45, y2 + 0.72, 0])
        P["person"].move_to([5.45, y2, 0])
        P["accept"].move_to([5.45, y2 - 0.72, 0])
        P["store"].move_to([5.45, y2 - 1.85, 0])
        P["mastra"].move_to([-1.25, y2 - 0.95, 0])
        P["change"].move_to([-2.4, -3.35, 0])
        P["outside"].next_to(P["change"], RIGHT, buff=0.3)

        L = {}
        L["rules_compiler"] = link(P["rules"], P["compiler"])
        L["tree_compiler"] = link(P["tree"], P["compiler"], side="v")
        for o in outs:
            L["compiler_" + o] = Arrow(P["compiler"].get_right(), P[o].get_left(), buff=0.06, color=MUTED,
                                       stroke_width=2, tip_length=0.14, max_tip_length_to_length_ratio=0.3)
            L[o + "_drafter"] = Arrow(P[o].get_right(), P["drafter"].get_left(), buff=0.06, color=MUTED,
                                      stroke_width=2, tip_length=0.14, max_tip_length_to_length_ratio=0.3)
        d = P["drafter"]
        L["drafter_decode"] = elbow([d.get_bottom(), [d.get_x(), 0.3, 0], [P["decode"].get_x(), 0.3, 0],
                                     P["decode"].get_top()])
        for a, b in [("decode", "code"), ("code", "judges"), ("judges", "verdicts"), ("verdicts", "bindings")]:
            L[a + "_" + b] = link(P[a], P[b], side="h")
        for e in ["repair", "person", "accept"]:
            L["bindings_" + e] = Arrow(P["bindings"].get_right(), P[e].get_left(), buff=0.06, color=MUTED,
                                       stroke_width=3, tip_length=0.16, max_tip_length_to_length_ratio=0.3)
        L["repair_drafter"] = elbow([P["repair"].get_top(), [5.45, y1, 0], d.get_right()], color=C["model"])
        L["accept_store"] = link(P["accept"], P["store"], side="v")
        L["change_rules"] = elbow([P["change"].get_left(), [-6.95, -3.35, 0], [-6.95, y1 - 0.15, 0],
                                   P["rules"].get_left() + DOWN * 0.15], color=MUTED, dashed=True)
        self.parts, self.links = P, L
        # draw order: lanes under boxes
        self.add(P["mastra"], P["change"], P["outside"], *L.values(),
                 *[v for k, v in P.items() if k not in ("mastra", "change", "outside")])
        remember(self)
        self.groups = {
            "compiler_outputs": outs,
            "run": ["drafter", "decode", "code", "judges", "verdicts", "bindings", "repair", "person", "accept", "store"],
            "exits": ["repair", "person", "accept"],
        }

    def names(self, *names):
        out = []
        for n in names:
            out += self.groups.get(n, [n])
        return out

    def highlight(self, *names, dim=0.2):
        """Animation that lights the named parts (and the links between them) and dims the rest."""
        keep = set(self.names(*names))
        anims = [Level(m, 1 if k in keep else dim) for k, m in self.parts.items()]
        for k, m in self.links.items():
            a, b = k.split("_", 1)
            anims.append(Level(m, 1 if (a in keep and b in keep) else dim))
        return AnimationGroup(*anims)

    def restore(self):
        return AnimationGroup(*[Level(m, 1) for m in list(self.parts.values()) + list(self.links.values())])

    def focus(self, *names, max_w=12.6, max_h=5.6, center=ORIGIN + DOWN * 0.3):
        """Animation that zooms the diagram onto the named parts."""
        grp = VGroup(*[self.parts[n] for n in self.names(*names)])
        k = max(1.0, min(max_w / grp.width, max_h / grp.height, 2.2))  # never shrink text
        c = grp.get_center()
        return self.animate.scale(k, about_point=c).shift(np.array(center) - c)


def outline_beat(scene, *names, title=None):
    """Bring the outline back and light the named parts. Returns the diagram (on screen)."""
    od = OutlineDiagram().shift(DOWN * 0.25)
    scene.play(FadeIn(od), run_time=0.8)
    scene.play(od.highlight(*names), run_time=0.8)
    return od


def category_tree(size=20, dx=2.3, dy=1.25, levels=True):
    """skincare (domain) -> sunscreen, moisturizer (inner) -> mineral sunscreen (leaf).

    Returns a VGroup with .nodes[name], .edges[(parent, child)], .levels[name]."""
    nodes = {
        "skincare": box("skincare", C["tree"], size=size, h=0.6),
        "sunscreen": box("sunscreen", C["tree"], size=size, h=0.6),
        "moisturizer": box("moisturizer", C["tree"], size=size, h=0.6),
        "mineral sunscreen": box("mineral sunscreen", C["tree"], size=size, h=0.6),
    }
    nodes["skincare"].move_to([0, dy, 0])
    nodes["sunscreen"].move_to([-dx / 2, 0, 0])
    nodes["moisturizer"].move_to([dx / 2, 0, 0])
    nodes["mineral sunscreen"].move_to([-dx / 2, -dy, 0])
    edges = {}
    for a, b in [("skincare", "sunscreen"), ("skincare", "moisturizer"), ("sunscreen", "mineral sunscreen")]:
        edges[(a, b)] = Line(nodes[a].get_bottom(), nodes[b].get_top(), color=C["tree"], stroke_width=2.5)
    g = VGroup(*edges.values(), *nodes.values())
    lv = {}
    if levels:
        for name, y in [("domain", dy), ("inner", 0), ("leaf", -dy)]:
            lv[name] = T(name, size=18, color=MUTED).move_to([-dx / 2 - 2.0, y, 0])
        g.add(*lv.values())
    g.nodes, g.edges, g.levels = nodes, edges, lv
    return g
