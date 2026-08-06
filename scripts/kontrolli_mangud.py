"""Kontroll: kas KÕIK turniirifailide mängud jõuavad Mängijate lehele?

Käivita:  python scripts/kontrolli_mangud.py

Miks see olemas on: turniirifailidel on mitu formaati (single-elimination,
alagrupid + positsioonimängud, alagrupid + väljamängud). Iga kord kui JSON-i
lisandub uus sektsioon, tuleb see lisada ka `mangijad.js` kogujasse — muidu
kaovad mängud vaikselt H2H-st ja profiilidest ära (nii juhtus 7. etapi
väljamängudega: finaal Priit–Andrus 7-5 puudus mängijate lehelt).

NB! Kui lisad `mangijad.js`-i uue sektsiooni, lisa see ka siia KAETUD hulka.
"""

import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
TURNIIRID = REPO / "data" / "turniirid"

# Rajad, mille mangijad.js kogub: (juurvõti, viimane võti enne matši)
KAETUD = {
    ("pohitabel", "round_1"),
    ("pohitabel", "veerandfinaalid"),
    ("pohitabel", "poolfinaalid"),
    ("pohitabel", "finaal"),
    ("pohitabel", "koht_3_4"),
    ("kohamang_5_8", "poolfinaalid"),
    ("kohamang_5_8", "koht_5_6"),
    ("kohamang_5_8", "koht_7_8"),
    ("lohutused_grupp_A", "mangud"),
    ("lohutused_grupp_B", "poolfinaalid"),
    ("lohutused_grupp_B", "finaal"),
    ("lohutused_grupp_B", "koht_3_4"),
    ("alagrupid", "mangud"),
    ("positsioonimangud", "mangud"),
    ("valjamangud", "poolfinaalid"),
    ("valjamangud", "finaal"),
    ("valjamangud", "koht_3_4"),
    ("valjamangud", "koht_5_6"),
}


def leia_mangud(node, path, out):
    """Leia rekursiivselt kõik matši-objektid (need, millel on 'voitja')."""
    if isinstance(node, dict):
        if "voitja" in node:
            out.append(([p for p in path if not isinstance(p, int)], node))
            return
        for k, v in node.items():
            leia_mangud(v, path + [k], out)
    elif isinstance(node, list):
        for i, v in enumerate(node):
            leia_mangud(v, path + [i], out)


def main():
    failid = sorted(TURNIIRID.glob("*.json"))
    if not failid:
        print("Turniirifaile ei leitud.")
        return 1

    kokku = kogumata = 0
    for f in failid:
        d = json.loads(f.read_text(encoding="utf-8"))
        leitud = []
        leia_mangud(d, [], leitud)

        lahtised = []
        for path, m in leitud:
            key = (path[0], path[-1]) if len(path) > 1 else (path[0], path[0])
            if key not in KAETUD:
                lahtised.append(("/".join(path), m.get("voitja"),
                                 m.get("kaotaja"), m.get("skoor")))

        kokku += len(leitud)
        kogumata += len(lahtised)
        margis = "OK " if not lahtised else "VIGA"
        print(f"  [{margis}] {f.name}: {len(leitud)} mängu, kogumata {len(lahtised)}")
        for rada, a, b, s in lahtised:
            print(f"          {rada}: {a} vs {b} ({s})")

    print(f"\nKokku {kokku} mängu, kogumata {kogumata}")
    if kogumata:
        print("\nVIGA: osa mange ei joua Mangijate lehele.")
        print("  Lisa puuduv sektsioon mangijad.js buildMatches() sisse JA siia KAETUD hulka.")
        return 1
    print("KORRAS: koik turniirimangud jouavad Mangijate lehele.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
