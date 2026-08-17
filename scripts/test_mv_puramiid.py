"""Test: kas MV-tulemused liiguvad püramiidis õigesti?

Käivita:  python scripts/test_mv_puramiid.py

Kontrollib kokkulepitud reegleid (17.08.2026):
  - arvesse lähevad ainult mängud, kus MÕLEMAD on püramiidis;
  - võitja saab parema koha (allpool olnud võitis -> kohavahetus);
  - ülalpool olev võitis -> midagi ei muutu;
  - loobumisvõit loeb tavalise tulemusena;
  - sama mäng ei rakendu kaks korda (mv_match_id).

Test töötab päris data/puramiid.json koopial, faili ei muuda.
"""

import copy
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from mv_fetch import apply_to_pyramid, norm_name  # noqa: E402

REPO = Path(__file__).resolve().parent.parent
PYR = json.loads((REPO / "data" / "puramiid.json").read_text(encoding="utf-8"))


def pos(pyr, nimi):
    for p in pyr["players"]:
        if norm_name(p["name"]) == norm_name(nimi):
            return p["pos"]
    return None


def mang(mid, voitja, kaotaja, skoor="6/4 6/4", **kw):
    d = {
        "id": mid, "bracket": "main", "round": "R2", "round_title": "2. ring",
        "round_nr": 2, "index": mid, "p1": voitja, "p2": kaotaja,
        "score": skoor, "winner": voitja, "loser": kaotaja,
        "walkover": False, "disqualified": False, "in_progress": False,
        "date": "2026-08-17", "time": "18:00", "court": "Court 1",
    }
    d.update(kw)
    return d


def check(nimi, tingimus, lisa=""):
    print(f"  [{'OK  ' if tingimus else 'VIGA'}] {nimi}{(' - ' + lisa) if lisa else ''}")
    return 0 if tingimus else 1


vigu = 0
print("Lahtekoht:")
for n in ("Priit Raudla", "Gennadi Lepp", "Andrus Jurgenson", "Ilja Balabko"):
    pass
naidis = {p["name"]: p["pos"] for p in PYR["players"][:14]}
print("  ", json.dumps(naidis, ensure_ascii=False))
print()

# --- 1. Allpool olev voidab -> kohavahetus ---
print("1. Allpool olev voidab -> kohad vahetuvad")
pyr = copy.deepcopy(PYR)
a, b = "Ilja Balabko", "Priit Raudla"          # Ilja 11., Priit 4.
pa, pb = pos(pyr, a), pos(pyr, b)
apply_to_pyramid([mang(9001, a, b)], pyr)
vigu += check("voitja sai kaotaja koha", pos(pyr, a) == pb, f"{pa}. -> {pos(pyr,a)}.")
vigu += check("kaotaja sai voitja koha", pos(pyr, b) == pa, f"{pb}. -> {pos(pyr,b)}.")
vigu += check("mang laks kirja tuubiga 'mv'", pyr["games"][-1]["type"] == "mv")
vigu += check("challenger on allpool olnud mangija",
              pyr["games"][-1]["challenger"] == a)

# --- 2. Ulalpool olev voidab -> midagi ei muutu ---
print("\n2. Ulalpool olev voidab -> kohad jaavad samaks")
pyr = copy.deepcopy(PYR)
pa, pb = pos(pyr, b), pos(pyr, a)
apply_to_pyramid([mang(9002, b, a)], pyr)
vigu += check("voitja koht ei muutunud", pos(pyr, b) == pa, f"{pa}.")
vigu += check("kaotaja koht ei muutunud", pos(pyr, a) == pb, f"{pb}.")
vigu += check("mang laks siiski kirja", pyr["games"][-1]["mv_match_id"] == 9002)

# --- 3. Uks mangija pole puramiidis -> vahele ---
print("\n3. Uks mangija pole puramiidis -> mangu ei arvestata")
pyr = copy.deepcopy(PYR)
enne = len(pyr["games"])
apply_to_pyramid([mang(9003, "Marcel Mikiver", "Andri Reiman"),
                  mang(9004, "Toivo Teng", "Mikk Kadak")], pyr)
vigu += check("uhtegi mangu ei lisatud", len(pyr["games"]) == enne,
              f"{len(pyr['games']) - enne} lisatud")

# --- 4. Idempotentsus ---
print("\n4. Sama mang kaks korda -> rakendub uks kord")
pyr = copy.deepcopy(PYR)
pa = pos(pyr, a)
apply_to_pyramid([mang(9005, a, b)], pyr)
vahepeal = pos(pyr, a)
enne = len(pyr["games"])
apply_to_pyramid([mang(9005, a, b)], pyr)   # uuesti, sama ID
vigu += check("teist kirjet ei tekkinud", len(pyr["games"]) == enne)
vigu += check("koht ei liikunud teist korda", pos(pyr, a) == vahepeal,
              f"{pa}. -> {vahepeal}. -> {pos(pyr,a)}.")

# --- 5. Loobumine loeb tavalise tulemusena ---
print("\n5. Loobumine loeb tavalise tulemusena")
pyr = copy.deepcopy(PYR)
pb = pos(pyr, b)
apply_to_pyramid([mang(9006, a, b, skoor=None, walkover=True)], pyr)
vigu += check("kohad vahetusid ka loobumisel", pos(pyr, a) == pb)
vigu += check("skoori asemel 'loobumine'", pyr["games"][-1]["score"] == "loobumine",
              repr(pyr["games"][-1]["score"]))

# --- 6. Mitu mangu jarjest, ajalises jarjekorras ---
print("\n6. Mitu mangu jarjest - ahelefekt")
pyr = copy.deepcopy(PYR)
c = "Reevo Kirna"
p_a, p_b, p_c = pos(pyr, a), pos(pyr, b), pos(pyr, c)
apply_to_pyramid([
    mang(9007, a, b, date="2026-08-17", time="17:00"),   # Ilja voidab Priitu
    mang(9008, a, c, date="2026-08-17", time="19:00"),   # siis Reevot
], pyr)
vigu += check("ahel toimis: voitja on korgeimal saavutatud kohal",
              pos(pyr, a) == min(p_b, p_c),
              f"Ilja {p_a}. -> {pos(pyr,a)}.  (Priit {p_b}., Reevo {p_c}.)")
vigu += check("molemad mangud kirjas",
              sum(1 for g in pyr["games"] if g.get("mv_match_id") in (9007, 9008)) == 2)

# --- 7. Kroon jaab 1. kohale ---
print("\n7. Kroon kuulub 1. kohale")
pyr = copy.deepcopy(PYR)
esimene = pyr["players"][0]["name"]
teine = pyr["players"][1]["name"]
apply_to_pyramid([mang(9009, teine, esimene)], pyr)
vigu += check("uus liider on 1. kohal", pyr["players"][0]["name"] == teine)
vigu += check("kroon liikus kaasa", pyr["players"][0].get("badge") == "👑")
vigu += check("vanal liidril krooni pole",
              all(p.get("badge") != "👑" for p in pyr["players"][1:]))

print(f"\n{'KORRAS: koik testid labitud.' if not vigu else f'VIGA: {vigu} kontrolli kukkus labi.'}")
sys.exit(1 if vigu else 0)
