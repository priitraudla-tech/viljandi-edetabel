"""Fetch Viljandi singles ranking from Google Sheets and save as JSON.

Saves:
- data/current.json     latest snapshot (overwritten each run)
- data/history/YYYY-MM-DD.json   one snapshot per day, only when content changes
- data/history.json     index of available history dates (sorted)
"""

import csv
import io
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

SHEET_ID = "1QMf8anC80lXGYdrb2fHlYOf8ETyksbOo"
GID = "1281577154"
URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={GID}"

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"
HISTORY_DIR = DATA_DIR / "history"

DATE_RE = re.compile(r"(\d{1,2})\.(\d{1,2})\.(\d{4})")


def fetch_csv() -> str:
    req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8")


def parse_int(s):
    s = (s or "").strip()
    if not s:
        return None
    try:
        return int(s.replace(" ", ""))
    except ValueError:
        return None


def parse_float(s):
    s = (s or "").strip().replace(",", ".")
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def extract_iso_date(label: str):
    m = DATE_RE.search(label)
    if not m:
        # "Viljandi maakonna MV 08.2025" — month-only
        m2 = re.search(r"(\d{1,2})\.(\d{4})", label)
        if m2:
            return f"{m2.group(2)}-{int(m2.group(1)):02d}-01"
        return None
    d, mo, y = m.groups()
    return f"{int(y):04d}-{int(mo):02d}-{int(d):02d}"


def parse(csv_text: str) -> dict:
    rows = list(csv.reader(io.StringIO(csv_text)))
    title = (rows[0][0] or "").strip() if rows else ""
    header = [c.strip().replace("\n", " ").replace("  ", " ") for c in rows[1]]

    def find_col(name):
        for i, h in enumerate(header):
            if h == name:
                return i
        raise ValueError(f"Column not found: {name}")

    pos_idx = find_col("Koht")
    name_idx = find_col("Nimi")
    total_idx = find_col("Kokku punkte")
    played_idx = find_col("Mängitud turniire")
    avg_idx = find_col("Keskmine punktisumma ühe turniiri kohta")

    fixed = {pos_idx, name_idx, total_idx, played_idx, avg_idx}
    stages = []
    for i, h in enumerate(header):
        if i in fixed or not h:
            continue
        stages.append({
            "index": i,
            "label": h,
            "date": extract_iso_date(h),
        })
    stages.sort(key=lambda s: s["date"] or "9999")

    players = []
    participants_row = None
    for r in rows[2:]:
        if not r or all(not c.strip() for c in r):
            continue
        first = r[0].strip() if r else ""
        second = r[1].strip() if len(r) > 1 else ""
        if first == "" and second.lower().startswith("osalejaid"):
            participants_row = r
            continue
        if not first:
            continue
        try:
            rank = int(first)
        except ValueError:
            continue
        name = r[name_idx].strip() if len(r) > name_idx else ""
        if not name:
            continue
        stage_results = {}
        for s in stages:
            v = r[s["index"]] if s["index"] < len(r) else ""
            stage_results[s["label"]] = parse_int(v)
        players.append({
            "rank": rank,
            "name": name,
            "total": parse_int(r[total_idx]) or 0,
            "stages": stage_results,
            "tournaments_played": parse_int(r[played_idx]) or 0,
            "average": parse_float(r[avg_idx]) or 0.0,
        })

    participants_per_stage = {}
    if participants_row:
        for s in stages:
            v = participants_row[s["index"]] if s["index"] < len(participants_row) else ""
            participants_per_stage[s["label"]] = parse_int(v)

    return {
        "title": title,
        "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "stages": [{"label": s["label"], "date": s["date"]} for s in stages],
        "players": players,
        "participants_per_stage": participants_per_stage,
    }


def _strip_deltas(players):
    """Compare players ignoring delta-related fields."""
    return [
        {k: v for k, v in p.items() if k not in ("prev_rank", "rank_delta")}
        for p in players
    ]


def players_equal(a: dict, b: dict) -> bool:
    return (
        a.get("title") == b.get("title")
        and a.get("stages") == b.get("stages")
        and _strip_deltas(a.get("players", [])) == _strip_deltas(b.get("players", []))
        and a.get("participants_per_stage") == b.get("participants_per_stage")
    )


def annotate_deltas(parsed: dict, prior: dict | None) -> None:
    """Add prev_rank + rank_delta to each player based on prior snapshot."""
    prev_lookup = {}
    prior_date = None
    if prior:
        prior_date = prior.get("snapshot_date")
        for p in prior.get("players", []):
            prev_lookup[p["name"]] = p.get("rank")

    for p in parsed["players"]:
        prev = prev_lookup.get(p["name"])
        p["prev_rank"] = prev
        if prev is None:
            p["rank_delta"] = None  # uus mängija või eelmist snapshot'i pole
        else:
            # rank decreased = moved up = positive delta
            p["rank_delta"] = prev - p["rank"]

    parsed["compared_to"] = prior_date


def update_stage_timeline(parsed: dict, timeline_path: Path) -> None:
    """Track when each stage was first observed.

    Stores `data/stage_timeline.json`: { "<stage label>": { "first_seen": ISO,
    "first_run": bool } }. On the very first run, retroactive stages get
    first_run=true and a null first_seen — UI can suppress the timestamp.
    On subsequent runs, newly appearing stages get a real timestamp.
    """
    timeline = {}
    if timeline_path.exists():
        try:
            timeline = json.loads(timeline_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            timeline = {}

    is_first_run = not timeline
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")

    for s in parsed["stages"]:
        label = s["label"]
        if label not in timeline:
            if is_first_run:
                timeline[label] = {"first_seen": None, "first_run": True}
            else:
                timeline[label] = {"first_seen": now, "first_run": False}

    timeline_path.write_text(
        json.dumps(timeline, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    for s in parsed["stages"]:
        entry = timeline.get(s["label"], {})
        s["first_seen"] = entry.get("first_seen")
        s["first_run"] = entry.get("first_run", False)


def write_json(path: Path, obj) -> None:
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")


def main():
    csv_text = fetch_csv()
    parsed = parse(csv_text)

    DATA_DIR.mkdir(exist_ok=True)
    HISTORY_DIR.mkdir(parents=True, exist_ok=True)

    today = datetime.now().strftime("%Y-%m-%d")
    parsed["snapshot_date"] = today
    snapshot_path = HISTORY_DIR / f"{today}.json"

    existing = sorted(HISTORY_DIR.glob("*.json"))
    prior = None
    for p in reversed(existing):
        if p.name != snapshot_path.name:
            prior = json.loads(p.read_text(encoding="utf-8"))
            break

    annotate_deltas(parsed, prior)
    update_stage_timeline(parsed, DATA_DIR / "stage_timeline.json")

    save_snapshot = True
    if prior is not None and players_equal(prior, parsed):
        if not snapshot_path.exists():
            save_snapshot = False
            print(f"No data changes vs {existing[-1].stem} — skipping snapshot.")

    if save_snapshot:
        write_json(snapshot_path, parsed)
        print(f"Snapshot saved: {snapshot_path.name}")

    write_json(DATA_DIR / "current.json", parsed)

    history_dates = sorted(p.stem for p in HISTORY_DIR.glob("*.json"))
    write_json(DATA_DIR / "history.json", history_dates)
    print(f"History index: {len(history_dates)} entries")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
