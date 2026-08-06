"""Kontroll: kas edetabeli tõusu/languse nooled on õigel alusel arvutatud?

Käivita:  python scripts/kontrolli_nooled.py

Miks see olemas on: nooled võrreldakse viimase VARASEMA snapshot'iga, mille
edetabel tegelikult erineb — nii püsivad nooled turniiride vahel ja näitavad
alati liikumist eelmise turniiri seisuga võrreldes.

Seda on kaks korda katki tehtud sellega, et võrdlusse on sattunud väli, mis
ei ole edetabeli sisu:
  1. stages.first_seen / first_run  (rikastus, sõltub töötlusjärjekorrast)
  2. title ja players.sheet_rank    (Sheetsi pealkirja "seisuga" kuupäev ja
                                     Sheetsi enda Koht-veerg, mida omanik
                                     uuendab turniirist eraldi)
Kui selline väli satub võrdlusse, loetakse iga uus snapshot "erinevaks",
võrdlusbaasiks jääb juba uuendatud tabel ja KÕIK nooled kaovad.

NB! Kui lisad snapshot'i uue tuletatud/diagnostilise välja, lisa see
fetch.py-s _MITTE_SISU hulka või _norm_stages'i — mitte võrdlusse.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fetch import standings_equal  # noqa: E402

REPO = Path(__file__).resolve().parent.parent
HISTORY = REPO / "data" / "history"


def oodatav_baas(snaps, i):
    """Millise varasema snapshot'iga PEAKS i-s snapshot end võrdlema?"""
    for j in range(i - 1, -1, -1):
        if not standings_equal(snaps[j][1], snaps[i][1]):
            return snaps[j][0]
    return None


def main():
    failid = sorted(HISTORY.glob("*.json"))
    if not failid:
        print("Ajaloo-snapshot'e ei leitud.")
        return 1

    snaps = [(f.stem, json.loads(f.read_text(encoding="utf-8"))) for f in failid]
    vigu = 0

    for i, (nimi, d) in enumerate(snaps):
        oodatud = oodatav_baas(snaps, i)
        tegelik = d.get("compared_to")
        nooli = sum(1 for p in d["players"] if p.get("rank_delta"))

        if tegelik != oodatud:
            vigu += 1
            print(f"  [VIGA] {nimi}: võrdlusbaas on {tegelik}, peaks olema {oodatud}")
            continue

        # Baas on õige, aga kas nooled ka päriselt arvutatud?
        if oodatud is not None:
            baas = dict(snaps[i - 1][1])
            for j in range(i - 1, -1, -1):
                if snaps[j][0] == oodatud:
                    baas = snaps[j][1]
                    break
            eelmine = {p["name"]: p["rank"] for p in baas["players"]}
            oodatud_nooli = sum(
                1 for p in d["players"]
                if eelmine.get(p["name"]) not in (None, p["rank"])
            )
            if nooli != oodatud_nooli:
                vigu += 1
                print(f"  [VIGA] {nimi}: noolega {nooli} mängijat, "
                      f"kohamuutusi tegelikult {oodatud_nooli}")
                continue

        print(f"  [OK  ] {nimi}: baas {oodatud or '—'}, noolega {nooli} mängijat")

    # current.json peab vastama viimasele snapshot'ile
    cur = json.loads((REPO / "data" / "current.json").read_text(encoding="utf-8"))
    if not standings_equal(cur, snaps[-1][1]):
        vigu += 1
        print(f"\n  [VIGA] current.json ei vasta viimasele snapshot'ile ({snaps[-1][0]}).")

    if vigu:
        print(f"\nVIGA: {vigu} probleemi. Vaata fetch.py standings_equal / _MITTE_SISU ule.")
        return 1
    print("\nKORRAS: nooled on oigel alusel - vordlus kaib eelmise turniiri seisuga.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
