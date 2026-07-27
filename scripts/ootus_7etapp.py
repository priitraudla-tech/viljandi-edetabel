"""VÜS 7. etapi järgse edetabeli ennustus ja hilisem kontroll.

Kasutus:
    python scripts/ootus_7etapp.py arvuta     # arvutab ootuse ja salvestab
    python scripts/ootus_7etapp.py kontrolli  # võrdleb ootust Sheetsi tegeliku seisuga

Reeglid (tuletatud Sheetsi ajaloolistest andmetest, kehtisid kõigil
mängijatel kõigis varasemates snapshot'ides):
    Kokku punkte = parima 6 etapitulemuse summa
    Keskmine     = KÕIGI tulemuste summa / mängitud turniire
"""

import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
CURRENT = REPO / "data" / "current.json"
OOTUS = REPO / "data" / "ootus_7etapp.json"

STAGE = "7. etapp 26.07.2026"
BEST_N = 6

# 7. etapi tulemused turniiripaberi järgi (finaal: Priit 7-5 Andrus)
TULEMUSED = {
    "Priit Raudla": 100,
    "Andrus Jürgenson": 70,
    "Reevo Kirna": 50,
    "Eneli Pihl": 40,
    "Ilja Balabko": 30,
    "Marcel Mikiver": 26,
}


def arvuta_rida(stages):
    """total = parima 6 summa; keskmine = koguSumma / turniire."""
    vals = sorted([v for v in stages.values() if v], reverse=True)
    total = sum(vals[:BEST_N])
    played = len(vals)
    avg = round(sum(vals) / played, 1) if played else 0.0
    return total, played, avg


def jarjesta(players):
    """Sorteeri punktide järgi; võrdsed punktid jagavad kohta."""
    players.sort(key=lambda p: (-p["total"], p["name"]))
    prev_total, prev_rank = None, 0
    for i, p in enumerate(players, start=1):
        if p["total"] != prev_total:
            prev_rank = i
        prev_total = p["total"]
        p["rank"] = prev_rank
    return players


def arvuta():
    cur = json.loads(CURRENT.read_text(encoding="utf-8"))
    praegu = {p["name"]: p["rank"] for p in cur["players"]}

    oodatud = []
    for p in cur["players"]:
        stages = dict(p["stages"])
        if p["name"] in TULEMUSED:
            stages[STAGE] = TULEMUSED[p["name"]]
        total, played, avg = arvuta_rida(stages)
        oodatud.append({
            "name": p["name"],
            "total": total,
            "tournaments_played": played,
            "average": avg,
            "rank_enne": praegu.get(p["name"]),
        })
    jarjesta(oodatud)
    for p in oodatud:
        p["rank_muutus"] = (p["rank_enne"] - p["rank"]) if p["rank_enne"] else None

    OOTUS.write_text(json.dumps({
        "selgitus": "Oodatav seis PARAST seda, kui Sheetsi lisatakse 7. etapi tulemused",
        "reegel": f"kokku = parima {BEST_N} summa; keskmine = koigi summa / turniire",
        "etapp": STAGE,
        "lisatavad_tulemused": TULEMUSED,
        "baas_fetched_at": cur.get("fetched_at"),
        "players": oodatud,
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Ootus salvestatud: {OOTUS.relative_to(REPO)}\n")
    print(f"{'Koht':>4}  {'Mängija':<22} {'Punkte':>6} {'Turn':>4} {'Keskm':>6}  Muutus")
    for p in oodatud[:14]:
        d = p["rank_muutus"]
        nool = "—" if not d else (f"▲{d}" if d > 0 else f"▼{-d}")
        tahis = " *" if p["name"] in TULEMUSED else ""
        print(f"{p['rank']:>4}. {p['name']:<22} {p['total']:>6} "
              f"{p['tournaments_played']:>4} {p['average']:>6}  {nool}{tahis}")
    print("\n* = mängis 7. etapil")


def kontrolli():
    if not OOTUS.exists():
        print("Ootust pole salvestatud — käivita esmalt: arvuta")
        return 1
    oot = json.loads(OOTUS.read_text(encoding="utf-8"))
    cur = json.loads(CURRENT.read_text(encoding="utf-8"))

    tegelik = {p["name"]: p for p in cur["players"]}
    sisestatud = sum(1 for n in TULEMUSED if tegelik.get(n, {}).get("stages", {}).get(STAGE))
    print(f"Sheetsi seis: {cur.get('title')}  (loetud {cur.get('fetched_at')})")
    print(f"7. etapi tulemusi sisestatud: {sisestatud}/{len(TULEMUSED)}\n")

    erinevused = []
    for p in oot["players"]:
        t = tegelik.get(p["name"])
        if not t:
            erinevused.append((p["name"], "puudub Sheetsist", "", ""))
            continue
        if t["total"] != p["total"]:
            erinevused.append((p["name"], "kokku punkte", p["total"], t["total"]))
        if t["rank"] != p["rank"]:
            erinevused.append((p["name"], "koht", p["rank"], t["rank"]))

    if not erinevused:
        print("✓ KLAPIB — Sheetsi seis vastab tapselt arvutatud ootusele.")
        return 0

    print(f"✗ ERINEVUSI: {len(erinevused)}")
    print(f"{'Mängija':<22} {'Väli':<14} {'Ootus':>8} {'Tegelik':>8}")
    for nimi, vali, a, b in erinevused:
        print(f"{nimi:<22} {vali:<14} {str(a):>8} {str(b):>8}")
    return 1


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "arvuta"
    sys.exit(kontrolli() if cmd.startswith("kontroll") else (arvuta() or 0))
