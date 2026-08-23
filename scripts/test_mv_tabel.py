"""Test: kas kahvlid on struktuurselt terved?

Käivita:  python scripts/test_mv_tabel.py

Kontrollib data/mv.json-i (mitte võrku):
  1. igas kahvlis on ringide kohtade arv kahanev ja iga järgmine ring on
     täpselt pool eelmisest (16 -> 8 -> 4 -> 2 -> 1) — muidu ei joonistu
     kahvel õigesti;
  2. ühtegi mängu ID-d ei esine kahes kahvlis;
  3. ükski mängija ei ole ühes ringis kahes mängus.

Miks see olemas on: 19.08.2026 lisas korraldaja tournatedisse eraldi loosi
"13-16", millel on OMA 'main' bracket. Vana kood grupeeris bracket-tüübi,
mitte loosi järgi ja liitis selle poolfinaali põhitabeli poolfinaali sisse —
põhitabeli SF-is oli 4 mängu, sh Mikk Kadak - Ilja Balabko, kes olid
põhitabelist ammu väljas. Reegel 1 püüab selle kinni.
"""

import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
MV = REPO / "data" / "mv.json"

vigu = 0


def chk(nimi, ok, lisa=""):
    global vigu
    if not ok:
        vigu += 1
    print(f"  [{'OK  ' if ok else 'VIGA'}] {nimi}{(' - ' + lisa) if lisa else ''}")


def main():
    if not MV.exists():
        print("data/mv.json puudub — pole midagi kontrollida.")
        return 0
    mv = json.loads(MV.read_text(encoding="utf-8"))
    brackets = mv.get("brackets") or []
    chk("kahvleid on vähemalt üks", bool(brackets))

    nahtud_id = {}
    for b in brackets:
        print(f"\n{b['type']} — {b['title']}")
        # 3.-4. koha mäng (place_match) ei ole kahvli osa — ei loe poolitusse.
        ringid = [r for r in b["rounds"] if not r.get("place_match")]
        kohad = [len(r["matches"]) for r in ringid]
        # 1. Kahanev ja pooleks
        pooleks = all(kohad[i] == 2 * kohad[i + 1] for i in range(len(kohad) - 1))
        chk("ringid poolituvad (n -> n/2)", pooleks, " -> ".join(map(str, kohad)))
        chk("viimane ring on 1 mäng", kohad[-1] == 1, f"viimane={kohad[-1]}")

        for r in b["rounds"]:
            # 2. ID-d unikaalsed kõigi kahvlite lõikes
            for m in r["matches"]:
                if m["id"] in nahtud_id:
                    chk(f"mäng {m['id']} ainult ühes kahvlis", False,
                        f"ka {nahtud_id[m['id']]}")
                nahtud_id[m["id"]] = f"{b['type']}/{r['title']}"
            # 3. Mängija ühes ringis max üks kord
            nimed = [n for m in r["matches"] for n in (m["p1"], m["p2"]) if n]
            topelt = sorted({n for n in nimed if nimed.count(n) > 1})
            chk(f"{r['title']}: iga mängija ühes ringis korra", not topelt,
                ", ".join(topelt) if topelt else "")

    # 4. Kohamängude tabelites ei tohi olla "3.-4. koha mäng" ega "Finaal" —
    #    need nimed kehtivad ainult põhitabelis. 13.-16. tabeli "3-4 place" on
    #    tegelikult 15.-16. koha mäng (23.08.2026 tagasiside).
    print("\nKohamängude nimed:")
    for b in brackets:
        if b["type"] == "main":
            continue
        halvad = [r["title"] for r in b["rounds"]
                  if r["title"] in ("Finaal", "3.–4. koha mäng")]
        chk(f"{b['type']}: ringinimed kohtade keeles", not halvad,
            ", ".join(halvad) if halvad else "")

    # 5. Loppjarjestus (standings): iga turniiril mangija on tapselt uks kord,
    #    kohad algavad 1-st ja on jarjestikused (jagatud kohad lubatud).
    print("\nLoppjarjestus:")
    st = mv.get("standings") or []
    mangijad = set()
    for b in brackets:
        for r in b["rounds"]:
            for m in r["matches"]:
                for n in (m["p1"], m["p2"]):
                    if n:
                        mangijad.add(" ".join(n.split()).lower())
    st_nimed = [" ".join(s["name"].split()).lower() for s in st]
    chk("iga mangija on jarjestuses tapselt korra",
        sorted(st_nimed) == sorted(mangijad) and len(st_nimed) == len(set(st_nimed)),
        f"{len(st_nimed)} jarjestuses / {len(mangijad)} tabelites")
    kohad = sorted((s["place_lo"], s["place_hi"]) for s in st)
    ok = bool(kohad) and kohad[0][0] == 1
    oodatud = 1
    for lo, hi in kohad:
        if lo < oodatud:            # jagatud koht: sama vahemik korduda voib
            continue
        if lo != oodatud:
            ok = False
            break
        oodatud = hi + 1
    chk("kohad on jarjestikused alates 1-st", ok,
        ", ".join(f"{lo}" if lo == hi else f"{lo}-{hi}" for lo, hi in kohad[:8]) + " ...")

    print()
    if vigu:
        print(f"VIGA: {vigu} kontrolli kukkus labi. Vaata mv_fetch.py collect().")
        return 1
    print("KORRAS: kahvlid on struktuurselt terved.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
