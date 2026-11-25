"""Draws the README picture docs/demo.png from a made-up session.

Runs docs/demo.tsx as a plugin test in a temp copy of the plugin, takes the pane tree it prints, draws that tree as a terminal page in
Claude Code's dark theme colors and shoots it with Edge headless. Needs the claude CLI and Edge. Run: python docs/demo.py
"""
import html
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

DOCS = Path(__file__).resolve().parent
REPO = DOCS.parent
EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
TREE_MARK = "DEMO-TREE "
COLUMNS = 58
LINE_PX = 20
WIDTH_PX = 560

# Claude Code's dark theme, for the theme keys the pane uses.
THEME = {
    "inactive": "#999999",
    "permission": "#b1b9f9",
    "suggestion": "#b1b9f9",
    "warning": "#ffc107",
    "ide": "#4782c8",
    "autoAccept": "#af87ff",
    "planMode": "#48968c",
    "bashBorder": "#fd5db1",
    "success": "#4eba65",
    "error": "#ff6b80",
}
DIFF_LINE = {"+": "background:#225c2b", "-": "background:#7a2936", "@": f"color:{THEME['inactive']}"}

PAGE = """<!doctype html><meta charset="utf-8"><style>
body {{ margin: 0; background: #1a1a1a; color: #e6e6e6; font: 15px/{line}px 'Cascadia Mono', Consolas, monospace; }}
.pane {{ margin: 12px; border: 1px solid #555; border-radius: 6px; padding: 4px 10px 8px; width: {cols}ch; }}
.title {{ color: #fff; font-weight: bold; padding-bottom: 4px; }}
.line {{ white-space: pre; overflow: hidden; text-overflow: ellipsis; }}
</style><div class="pane"><div class="title">Session</div>{body}</div>"""


def main():
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as folder:
        tmp = Path(folder)
        tree = pane_tree(tmp / "plugin")
        page = tmp / "demo.html"
        page.write_text(PAGE.format(line=LINE_PX, cols=COLUMNS, body=html_of(tree)), encoding="utf-8")
        height = (line_count(tree) + 3) * LINE_PX + 12
        shoot(page, (WIDTH_PX, height), DOCS / "demo.png", tmp / "edge")
    print(f"Wrote {DOCS / 'demo.png'}")


def pane_tree(plugin):
    """The pane's drawn tree, as docs/demo.tsx prints it when run as a test in a copy of the plugin."""
    for part in [".claude-plugin", "hooks", "types"]:
        shutil.copytree(REPO / part, plugin / part)
    shutil.copy(REPO / "tsconfig.json", plugin)
    shutil.copy(DOCS / "demo.tsx", plugin / "demo.test.tsx")
    run = subprocess.run(["claude", "plugin", "test", str(plugin)], capture_output=True, encoding="utf-8", timeout=300, shell=True)
    marked = [line for line in (run.stdout + run.stderr).splitlines() if line.startswith(TREE_MARK)]
    if not marked:
        raise SystemExit(f"The demo test printed no tree:\n{run.stdout}\n{run.stderr}")
    return json.loads(marked[0].removeprefix(TREE_MARK))


def html_of(node):
    """One element of the tree as HTML: a column Box puts each child on its own line."""
    if isinstance(node, str):
        return html.escape(node)
    props, children = node.get("props", {}), node.get("children", [])
    if node["type"] == "Code":
        return "".join(diff_line_html(line) for line in props["source"].split("\n"))
    if node["type"] == "Box" and props.get("flexDirection") == "column":
        return "".join(f'<div class="line">{html_of(child)}</div>' for child in children)
    inner = "".join(html_of(child) for child in children)
    if node["type"] != "Text":
        return inner
    return f'<span style="{text_style(props)}">{inner}</span>'


def text_style(props):
    color, background = props.get("color"), props.get("backgroundColor")
    styles = [f"color:{THEME.get(color, color)}" if color else "", f"background:{background}" if background else ""]
    return ";".join(style for style in styles if style)


def diff_line_html(line):
    return f'<div class="line" style="{DIFF_LINE.get(line[:1], "")}">{html.escape(line)}</div>'


def line_count(tree):
    """Lines the pane body takes: one per child of the top column, plus each diff line past a Code's first."""
    codes = [child for child in tree["children"] if isinstance(child, dict) and child["type"] == "Code"]
    return len(tree["children"]) + sum(code["props"]["source"].count("\n") for code in codes)


def shoot(page, size, picture, profile):
    """Edge now and then hangs without taking the screenshot, so it gets three tries."""
    command = [EDGE, "--headless", "--disable-gpu", "--hide-scrollbars", f"--user-data-dir={profile}", "--force-device-scale-factor=2",
               f"--window-size={size[0]},{size[1]}", f"--screenshot={picture}", page.as_uri()]
    for _ in range(3):
        try:
            subprocess.run(command, capture_output=True, timeout=60)
            return
        except subprocess.TimeoutExpired:
            continue
    raise SystemExit("Edge took no screenshot in three tries")


if __name__ == "__main__":
    main()
