"""One-off import: Püramiid-2025.xlsx -> data/puramiid.json.

Usage:
    python scripts/import_puramiid.py "C:/Users/Priit/Downloads/Püramiid-2025.xlsx"

Game types:
    tavaline         — regular pyramid challenge
    mv               — Viljandi maakonna MV (rows prefixed with '#')
    arvestusevaline  — off-record (rows wrapped in parentheses)
"""

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT = REPO_ROOT / "data" / "puramiid.json"

# Name-cleanup map for typos/variants found in the sheet.
NAME_FIXES = {
    "Karl V. Elmaste": "Karl Valter Elmaste",
    "LauriTõnisalu": "Lauri Tõnisalu",
    "Andres Jürgenson": "Andrus Jürgenson",
    "Indrek Taukar Hisp.": "Indrek Taukar",
    "Indrek Taukar  Hisp.": "Indrek Taukar",
    "Indrek Taukar Hisp": "Indrek Taukar",
}


def clean_name(raw):
    """Strip #, parentheses, dates and stray whitespace from a player name."""
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return None
    s = str(raw).strip()
    flags = {"mv": False, "off": False}
    if s.startswith("#"):
        flags["mv"] = True
        s = s.lstrip("#").strip()
    if s.startswith("(") and s.endswith(")"):
        flags["off"] = True
        s = s[1:-1].strip()
    # Drop trailing date fragments like "11/06 - 13/06"
    s = re.sub(r"\s*\d{1,2}/\d{1,2}\s*-\s*\d{1,2}/\d{1,2}\s*$", "", s).strip()
    s = re.sub(r"\s{2,}", " ", s)
    s = NAME_FIXES.get(s, s)
    return s, flags


def split_dates(raw):
    """'09.06/ 15.06' -> ('09.06', '15.06'); tolerate mess, keep raw on failure."""
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return None, None
    s = str(raw).strip()
    parts = [p.strip() for p in s.split("/") if p.strip()]
    if len(parts) == 2:
        return parts[0], parts[1]
    return s, None


def main(xlsx_path):
    xl = pd.ExcelFile(xlsx_path)

    # --- Pyramid sheet: scan every cell for "N. Name" patterns ---
    dfp = pd.read_excel(xl, sheet_name="Püramiid", header=None)
    players = []
    for _, row in dfp.iterrows():
        for cell in row:
            if isinstance(cell, str):
                m = re.match(r"^\s*(\d+)\.\s*(.+?)\s*$", cell)
                if m:
                    name = m.group(2).strip()
                    badge = ""
                    for emoji in ("👑", "👶"):
                        if emoji in name:
                            badge = emoji
                            name = name.replace(emoji, "").strip()
                    players.append({"pos": int(m.group(1)), "name": name, "badge": badge})
    players.sort(key=lambda p: p["pos"])

    # --- Challenge dates: build a per-name-pair queue (sheet rows drift) ---
    dfv = pd.read_excel(xl, sheet_name="Väljakutsed", header=None).iloc[1:]
    date_queue = {}
    for _, vrow in dfv.iterrows():
        c1 = clean_name(vrow[0])
        c2 = clean_name(vrow[1])
        if not c1 or not c2:
            continue
        key = (c1[0], c2[0])
        date_queue.setdefault(key, []).append(split_dates(vrow[2]))

    # --- Games ---
    dfm = pd.read_excel(xl, sheet_name="Mängud", header=None).iloc[1:]
    games = []
    for _, row in dfm.iterrows():
        nr = row[0]
        if pd.isna(nr):
            continue
        c1 = clean_name(row[1])
        c2 = clean_name(row[2])
        w = clean_name(row[4])
        if not c1 or not c2:
            continue
        challenger, f1 = c1
        challenged, f2 = c2
        winner = w[0] if w else None
        score = str(row[3]).strip() if not pd.isna(row[3]) else ""
        if score.startswith("(") and score.endswith(")"):
            score = score[1:-1].strip()

        gtype = "tavaline"
        if f1["mv"] or f2["mv"]:
            gtype = "mv"
        if f1["off"] or f2["off"]:
            gtype = "arvestusevaline"

        cd, pdte = None, None
        q = date_queue.get((challenger, challenged))
        if q:
            cd, pdte = q.pop(0)

        games.append({
            "nr": int(nr),
            "challenger": challenger,
            "challenged": challenged,
            "score": score,
            "winner": winner,
            "type": gtype,
            "challenge_date": cd,
            "play_date": pdte,
        })

    data = {
        "title": "Püramiid",
        "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "players": players,
        "games": games,
        "challenges": [],
    }

    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {OUT}")
    print(f"  players: {len(players)}")
    print(f"  games:   {len(games)}")
    types = {}
    for g in games:
        types[g["type"]] = types.get(g["type"], 0) + 1
    print(f"  types:   {types}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "C:/Users/Priit/Downloads/Püramiid-2025.xlsx")
