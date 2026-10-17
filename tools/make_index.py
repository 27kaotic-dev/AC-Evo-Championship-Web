#!/usr/bin/env python3
"""Rebuilds data/index.json from the *.web.json files in data/, so a new championship only needs its file
dropped into the data folder.  Run it from anywhere:

    python tools/make_index.py

(The GitHub Action in .github/workflows runs this for you on every push.)  The card on the library page is
built from the summary written here, so the page does not have to download every championship to list them."""
import glob
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(os.path.dirname(HERE), "data")


def summary(d, rel):
    cols, rounds = d["cols"], d["rounds"]
    done = [c for c in cols if c["done"]]
    todo = [c for c in cols if not c["done"]]

    def label(c):
        rd = rounds[c["round"]]
        return f"R{c['round'] + 1}  {rd.get('track') or rd['name']}  ·  {c['name']}", rd.get("date") or ""

    state = "done" if cols and not todo else ("live" if done else "new")
    rows = d["standings"]["drivers"]
    last, last_date = label(done[-1]) if done else ("", "")
    nxt, next_date = label(todo[0]) if todo else ("", "")
    return dict(name=d["name"], file=rel, state=state, rounds=len(rounds), races=len(cols), done=len(done),
                drivers=len(rows), last=last, last_date=last_date, next=nxt, next_date=next_date,
                top=[[r["name"], r["total"]] for r in rows[:3]], updated=(d.get("generated") or "")[:10])


def main():
    out = []
    for path in sorted(glob.glob(os.path.join(DATA, "*.web.json"))):
        rel = "data/" + os.path.basename(path)
        try:
            with open(path, "r", encoding="utf-8") as f:
                d = json.load(f)
            if d.get("format") != 1:
                raise ValueError("not a web viewer export")
            out.append(summary(d, rel))
        except (OSError, ValueError, KeyError, TypeError) as ex:
            print(f"skipped {rel}: {ex}", file=sys.stderr)
    rank = {"live": 0, "new": 1, "done": 2}
    # live first, then not started, then finished; the most recently exported first inside each group
    out.sort(key=lambda e: e["updated"], reverse=True)
    out.sort(key=lambda e: rank[e["state"]])
    text = json.dumps(out, indent=2, ensure_ascii=False) + "\n"
    target = os.path.join(DATA, "index.json")
    try:
        same = open(target, encoding="utf-8").read() == text
    except OSError:
        same = False
    if not same:
        with open(target, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
    print(f"{len(out)} championship(s) in data/index.json" + (" (unchanged)" if same else ""))


if __name__ == "__main__":
    main()
