"""Viljandimaa MV: tõmba loos ja tulemused tournated.com-ist.

Kirjutab:
- data/mv.json          turniiri seis: tabelid, tulevased mängud, tulemused
- data/puramiid.json    MV-tulemused kantakse püramiidi (ainult püramiidi
                        mängijate omavahelised mängud)

Käivita:  python scripts/mv_fetch.py

Andmeallikas on tournated.com avalik GraphQL-otspunkt (drawsDetailPublic),
sama, mida nende enda leht kasutab. Autentimist ei vaja.

NB! Tegemist on nende sisemise API-ga, mitte dokumenteeritud liidesega —
kui see ühel päeval muutub, kukub skript veaga läbi (ja Action jääb punaseks),
mitte ei kirjuta vigaseid andmeid üle. Vt kontrolli_mv.py.
"""

import json
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"

API = "https://www.tournated.com/api/graphql"
TOURNAMENT_ID = 11202
CATEGORY_ID = 62084          # Meeste üksikmäng
SEGMENTS = ("MD", "consolation", "Q")
SOURCE_URL = (f"https://www.tournated.com/tournament/{TOURNAMENT_ID}"
              f"/draws?category={CATEGORY_ID}&segment=MD")
TITLE = "Viljandimaa meistrivõistlused 2026 — meeste üksikmäng"

QUERY = """query D($filter: ListDrawInput) {
  drawsDetail: drawsDetailPublic(filter: $filter) {
    total
    draws {
      id title type segment size
      brackets {
        type
        rounds {
          title
          seeds {
            id round roundNumber matchIndex bracketType
            score status matchStatus date time
            isBye isWalkover isDisqualified isMatchInProgress isScoreConfirmed
            winnerEntryId
            court { name }
            entry1 { id users { user { id name surname } } }
            entry2 { id users { user { id name surname } } }
          }
        }
      }
    }
  }
}"""

# Kuvatavad nimed. Tundmatu võti kuvatakse muutmata kujul.
BRACKET_TITLES = {
    "main": "Põhitabel",
    "5-8": "Kohamängud 5.–8.",
    "9-16": "Kohamängud 9.–16.",
    "17-32": "Kohamängud 17.–32.",
    "consolation": "Lohutusmängud",
}
BRACKET_ORDER = ["main", "5-8", "9-16", "17-32", "consolation"]

ROUND_TITLES = {
    "R1": "1. ring",
    "R2": "2. ring",
    "R3": "3. ring",
    "R4": "4. ring",
    "Quarter-Final": "Veerandfinaal",
    "Semi-Final": "Poolfinaal",
    "Final": "Finaal",
}


def norm_name(s: str) -> str:
    """Võrdlusnimi: topeltvõtmed kokku, väiketähtedeks.

    tournatedis on nimed käsitsi sisestatud ('kert perkmann',
    'Daniel  Snegirjov'), meie failides korrektsel kujul — võrdlus peab
    mõlemad ühte vormi viima. Kuvamiseks kasutame ALATI oma faili nime.
    """
    return " ".join((s or "").split()).lower()


KATSEID = 3
OOTEAJAD = (3, 9)          # sekundites, katsete vahel


def _paring(segment: str) -> dict:
    body = json.dumps({
        "operationName": "D",
        "variables": {"filter": {
            "tournament": TOURNAMENT_ID,
            "tournamentCategory": CATEGORY_ID,
            "segment": segment,
        }},
        "query": QUERY,
    }).encode("utf-8")
    req = urllib.request.Request(API, data=body, headers={
        "content-type": "application/json",
        "accept": "application/json",
        "user-agent": "viljandi-edetabel (github.com/priitraudla-tech/viljandi-edetabel)",
    })
    with urllib.request.urlopen(req, timeout=45) as resp:
        return json.loads(resp.read().decode("utf-8"))


def graphql(segment: str) -> dict:
    """Küsi ühe segmendi loos. Ajutise tõrke korral proovi uuesti.

    Tegemist on võõra teenusega, mida pärime iga 30 min — juhuslikke
    ajalõppe, 5xx-e ja päringupiiranguid tuleb ette (nii juhtus 18.08.2026
    kell 09:01 UTC, kui kaheksa eelmist jooksu olid õnnestunud). Ühekordne
    tõrge ei tohi tervet jooksu maha võtta; püsiv tõrge peab.
    """
    viimane = None
    for katse in range(1, KATSEID + 1):
        try:
            payload = _paring(segment)
        except urllib.error.HTTPError as e:
            keha = ""
            try:
                keha = e.read().decode("utf-8", "replace")[:300]
            except Exception:
                pass
            viimane = f"HTTP {e.code} {e.reason}: {keha}"
            # 4xx (v.a 429) on päris viga — kordamine ei aita.
            if 400 <= e.code < 500 and e.code != 429:
                break
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as e:
            viimane = f"{type(e).__name__}: {e}"
        else:
            if payload.get("errors"):
                msgs = "; ".join(x.get("message", "?") for x in payload["errors"])
                viimane = f"GraphQL: {msgs}"
            else:
                return payload["data"]["drawsDetail"]

        if katse < KATSEID:
            paus = OOTEAJAD[katse - 1]
            print(f"  segment {segment}: katse {katse}/{KATSEID} ebaonnestus "
                  f"({viimane}) — proovin {paus} s parast uuesti", file=sys.stderr)
            time.sleep(paus)

    raise RuntimeError(f"Segment {segment} ei vastanud {KATSEID} katsega: {viimane}")


def entry_name(entry):
    users = (entry or {}).get("users") or []
    if not users:
        return None
    u = users[0].get("user") or {}
    nimi = " ".join(f"{u.get('name') or ''} {u.get('surname') or ''}".split())
    return nimi or None


def parse_match(seed, bracket_type, round_nr):
    """Tee seemnest mäng. Tühje kohti EI visata ära — kahvli kuju vajab neid
    (poolfinaal ja finaal on tabelis olemas ammu enne, kui mängijad selguvad)."""
    p1, p2 = entry_name(seed.get("entry1")), entry_name(seed.get("entry2"))

    voitja_id = seed.get("winnerEntryId")
    winner = loser = None
    if voitja_id is not None:
        e1 = (seed.get("entry1") or {}).get("id")
        e2 = (seed.get("entry2") or {}).get("id")
        if voitja_id == e1:
            winner, loser = p1, p2
        elif voitja_id == e2:
            winner, loser = p2, p1

    kuupaev = (seed.get("date") or "")[:10] or None
    return {
        "id": seed["id"],
        "bracket": bracket_type,
        "round": seed.get("round"),
        "round_title": ROUND_TITLES.get(seed.get("round"), seed.get("round")),
        # NB! API täidab roundNumber ainult 1. ringil, mujal on None —
        # järjekorranumber tuleb ringi asukohast tabelis, mitte sellest väljast.
        "round_nr": round_nr,
        "index": seed.get("matchIndex"),
        "p1": p1,
        "p2": p2,
        "score": (seed.get("score") or "").strip() or None,
        "winner": winner,
        "loser": loser,
        "walkover": bool(seed.get("isWalkover")),
        "disqualified": bool(seed.get("isDisqualified")),
        "in_progress": bool(seed.get("isMatchInProgress")),
        "date": kuupaev,
        "time": seed.get("time") or None,
        "court": ((seed.get("court") or {}) or {}).get("name"),
    }


def sort_key(m):
    """Ajaline järjekord; kuupäevata mängud lõppu, aga tabelijärjekorras."""
    return (
        m["date"] or "9999-99-99",
        m["time"] or "99:99",
        BRACKET_ORDER.index(m["bracket"]) if m["bracket"] in BRACKET_ORDER
        else 50 + _place_lo(m["bracket"]),
        m["round_nr"] or 99,
        m["index"] or 99,
    )


# Lisaloosid, mille korraldaja tournatedis juurde teeb (nt "7-8", "13-16").
# Võti = loosi pealkiri tournatedis. Tundmatu pealkiri kuvatakse muutmata.
DRAW_TITLES = {
    "7-8": "Kohamäng 7.–8.",
    "13-16": "Kohamängud 13.–16.",
    "5-6": "Kohamäng 5.–6.",
    "9-12": "Kohamängud 9.–12.",
    "15-16": "Kohamäng 15.–16.",
}


def bracket_title(tyyp):
    """Kahvli kuvanimi ükskõik millise tüübi jaoks: 'main' -> Põhitabel,
    '9-16' -> Kohamängud 9.–16., '13-16' (lisaloos) -> Kohamängud 13.–16.,
    '13-16/5-8' -> Kohamängud 13.–16. · Kohamängud 5.–8."""
    if tyyp in BRACKET_TITLES:
        return BRACKET_TITLES[tyyp]
    pea, _, ala = str(tyyp or "").partition("/")
    nimi = DRAW_TITLES.get(pea, f"Kohamängud {pea}")
    if ala:
        nimi = f"{nimi} · {BRACKET_TITLES.get(ala, ala)}"
    return nimi


def _place_lo(label):
    """'13-16' -> 13, '7-8' -> 7, 'main' -> 0, muu -> 999. Järjestamiseks."""
    m = re.match(r"^\s*(\d+)", str(label or ""))
    return int(m.group(1)) if m else (0 if label == "main" else 999)


def collect():
    """Kogu loosid tournatedist kahvlitena.

    GRUPEERIMINE KÄIB LOOSI KAUPA, mitte bracket-tüübi kaupa. Põhjus: korraldaja
    võib lisada turniirile eraldi loose (nt "7-8", "13-16"), millel on OMA
    'main' bracket ja OMA poolfinaal/finaal. 19.08.2026 tegi ta seda ja meie
    vana kood liitis 13.-16. koha loosi poolfinaali põhitabeli poolfinaali
    sisse — tabelis ilmus põhitabeli SF kohale Mikk Kadak - Ilja Balabko.

    Ringid jäävad SELLESSE järjekorda, mille API annab (R1, R2, QF, SF, Final) —
    roundNumber on API-s tühi, see on ainus usaldusväärne allikas.
    """
    loosid = {}   # (draw_id) -> {"title":..., "brackets": {btype: {rtitle: kirje}}}
    for segment in SEGMENTS:
        detail = graphql(segment)
        for draw in detail.get("draws") or []:
            did = draw.get("id")
            kirje_loos = loosid.setdefault(did, {
                "id": did,
                "title": (draw.get("title") or "").strip(),
                "brackets": {},
            })
            for b in draw.get("brackets") or []:
                btype = b.get("type") or segment
                bucket = kirje_loos["brackets"].setdefault(btype, {})
                for jrk, r in enumerate(b.get("rounds") or [], start=1):
                    seeds = r.get("seeds") or []
                    if not seeds:
                        continue
                    key = r.get("title") or f"R{jrk}"
                    kirje = bucket.setdefault(key, {"order": jrk, "matches": []})
                    for seed in seeds:
                        kirje["matches"].append(parse_match(seed, btype, kirje["order"]))

    # Pealoos = see, millel on kõige rohkem mänge (põhitabel 32 kohaga).
    # Kõik teised on lisaloosid: nende 'main' bracket nimetatakse loosi järgi.
    if not loosid:
        return []
    pea_id = max(loosid, key=lambda k: sum(
        len(kr["matches"]) for bt in loosid[k]["brackets"].values() for kr in bt.values()))

    out = []
    for did, loos in loosid.items():
        on_pea = did == pea_id
        for btype, rounds_raw in loos["brackets"].items():
            rounds = []
            for rtitle, kirje in rounds_raw.items():
                kirje["matches"].sort(key=lambda m: m["index"] or 0)
                rounds.append({
                    "round": rtitle,
                    "title": ROUND_TITLES.get(rtitle, rtitle),
                    "order": kirje["order"],
                    "matches": kirje["matches"],
                })
            rounds.sort(key=lambda r: r["order"])
            if not any(r["matches"] for r in rounds):
                continue

            if on_pea:
                tyyp, title = btype, BRACKET_TITLES.get(btype, btype)
            else:
                # Lisaloos: tüübiks loosi pealkiri (nt "13-16"), et see ei
                # seguneks pealoosi 'main'-iga; kuvanimi loosi järgi.
                tyyp = loos["title"] or f"draw-{did}"
                if btype != "main":
                    tyyp = f"{tyyp}/{btype}"
                title = bracket_title(tyyp)
            # bracket-välja igal mängul peab kattuma kahvli tüübiga (mv.js
            # otsib selle järgi kuvanime)
            for r in rounds:
                for m in r["matches"]:
                    m["bracket"] = tyyp
            out.append({"type": tyyp, "title": title, "rounds": rounds,
                        "draw_id": did, "draw_title": loos["title"]})

    # Järjestus: põhitabel, siis kohamängud kasvavas kohajärjekorras
    def jrk(b):
        t = b["type"]
        if t == "main":
            return (0, 0)
        return (1, _place_lo(t))
    out.sort(key=jrk)
    return out


def flatten(brackets):
    """Kõik mängud, kus vähemalt üks mängija on teada (tühjad kohad välja)."""
    return [m for b in brackets for r in b["rounds"] for m in r["matches"]
            if m["p1"] or m["p2"]]


# ---------- püramiid ----------

def swap_positions(a, b):
    a["pos"], b["pos"] = b["pos"], a["pos"]


def apply_to_pyramid(matches, pyr):
    """Kanna MV-tulemused püramiidi.

    Reeglid (kokkulepitud 17.08.2026):
      - arvesse lähevad ainult mängud, kus MÕLEMAD mängijad on püramiidis;
      - võitja saab parema koha: kui võitja oli püramiidis allpool, vahetuvad
        kohad; kui ülalpool olev võitis, ei muutu midagi;
      - loobumisvõit loeb tavalise tulemusena;
      - iga mäng rakendub täpselt ÜKS kord — seotakse tournatedi mängu ID-ga
        (mv_match_id), nii et korduv käivitamine ei liiguta kohti uuesti.
    """
    by_name = {norm_name(p["name"]): p for p in pyr["players"]}
    juba = {g.get("mv_match_id") for g in pyr["games"] if g.get("mv_match_id")}
    nr = max((g.get("nr") or 0) for g in pyr["games"]) if pyr["games"] else 0

    lisatud = []
    for m in sorted(matches, key=sort_key):
        if not m["winner"] or not m["loser"]:
            continue
        if m["id"] in juba:
            continue
        v = by_name.get(norm_name(m["winner"]))
        k = by_name.get(norm_name(m["loser"]))
        if not v or not k:
            continue  # vähemalt üks pole püramiidis

        # challenger = püramiidis allpool olnud mängija (suurem pos)
        if v["pos"] > k["pos"]:
            challenger, challenged = v, k
        else:
            challenger, challenged = k, v
        vahetus = v["pos"] > k["pos"]  # võitis allpool olnud -> kohad vahetuvad

        nr += 1
        pyr["games"].append({
            "nr": nr,
            "challenger": challenger["name"],
            "challenged": challenged["name"],
            "score": m["score"] or ("loobumine" if m["walkover"] else ""),
            "winner": v["name"],
            "type": "mv",
            "erand": False,
            "challenge_date": None,
            "play_date": m["date"],
            "mv_match_id": m["id"],
            "mv_round": f'{bracket_title(m["bracket"])} · {m["round_title"]}',
        })
        lisatud.append({
            "nr": nr,
            "voitja": v["name"],
            "kaotaja": k["name"],
            "skoor": m["score"],
            "vahetus": vahetus,
            "kohad": (challenged["pos"], challenger["pos"]),
        })
        if vahetus:
            swap_positions(v, k)

    if lisatud:
        pyr["players"].sort(key=lambda p: p["pos"])
        # Kroon kuulub 1. kohale, mitte mängijale.
        for p in pyr["players"]:
            if p.get("badge") == "👑":
                p["badge"] = ""
        pyr["players"][0]["badge"] = "👑"
        pyr["updated_at"] = datetime.now(timezone.utc).isoformat(timespec="milliseconds") \
            .replace("+00:00", "Z")
    return lisatud


def write_json(path: Path, obj):
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")


def main():
    brackets = collect()
    koik = flatten(brackets)
    if not koik:
        raise RuntimeError("Loosist ei tulnud ühtegi mängu — kas turniir on veel loosimata?")

    lopetatud = [m for m in koik if m["winner"]]
    tulevased = [m for m in koik if not m["winner"] and m["p1"] and m["p2"]]
    tulevased.sort(key=sort_key)
    lopetatud.sort(key=sort_key, reverse=True)

    mangijad = sorted({n for m in koik for n in (m["p1"], m["p2"]) if n},
                      key=lambda s: s.lower())

    mv = {
        "title": TITLE,
        "source_url": SOURCE_URL,
        "tournament_id": TOURNAMENT_ID,
        "category_id": CATEGORY_ID,
        "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "players": mangijad,
        "brackets": brackets,
        "upcoming": tulevased,
        "results": lopetatud,
        "counts": {
            "matches": len(koik),
            "played": len(lopetatud),
            "upcoming": len(tulevased),
            "players": len(mangijad),
        },
    }
    write_json(DATA_DIR / "mv.json", mv)
    print(f"mv.json: {len(koik)} mängu ({len(lopetatud)} mängitud, "
          f"{len(tulevased)} ees), {len(mangijad)} mängijat")

    pyr_path = DATA_DIR / "puramiid.json"
    pyr = json.loads(pyr_path.read_text(encoding="utf-8"))
    lisatud = apply_to_pyramid(lopetatud, pyr)
    if lisatud:
        write_json(pyr_path, pyr)
        print(f"Püramiidi lisatud {len(lisatud)} MV-mängu:")
        for x in lisatud:
            liik = "kohavahetus" if x["vahetus"] else "koht ei muutu"
            print(f"  #{x['nr']} {x['voitja']} v {x['kaotaja']} "
                  f"{x['skoor'] or '(loobumine)'} — {liik}")
    else:
        print("Püramiidi uusi MV-mänge ei lisandunud.")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"VIGA: {e}", file=sys.stderr)
        sys.exit(1)
