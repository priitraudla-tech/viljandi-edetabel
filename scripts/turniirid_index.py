"""Genereeri data/turniirid/index.json — nimekiri kõigist turniirifailidest.

Käivita pärast uue turniirifaili lisamist:  python scripts/turniirid_index.py
(update.yml teeb seda ka iga jooksuga ise.)

Miks see olemas on: leht leidis turniirifailid ainult Sheetsi etapiveergude
kuupäevade kaudu. 13.09.2026 9. etapi tulemused olid repos, aga lehel
nähtamatud, sest Sheetsis polnud veel "9. etapp 13.09.2026" veergu.
Staatiline host ei oska kausta sisu näidata — seepärast see indeks.
"""

import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DIR = REPO / "data" / "turniirid"
KUUPAEV = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def main():
    kirjed = []
    for f in sorted(DIR.glob("*.json")):
        if not KUUPAEV.match(f.stem):
            continue  # index.json ise ja muud mitte-turniirifailid
        d = json.loads(f.read_text(encoding="utf-8"))
        t = d.get("turniir") or {}
        y, m, p = f.stem.split("-")
        etapp = t.get("etapp")
        # Sama kuju nagu Sheetsi veerupealkiri ("9. etapp 13.09.2026"), et
        # Sheetsi uuenduse järel oleks tegu äratuntavalt sama etapiga.
        label = f"{etapp}. etapp {p}.{m}.{y}" if etapp else (t.get("nimi") or f.stem)
        kirjed.append({
            "date": f.stem,
            "label": label,
            "nimi": t.get("nimi"),
            "etapp": etapp,
            "osalejaid": len(d.get("loppjarjestus") or []),
        })
    kirjed.sort(key=lambda x: x["date"])
    (DIR / "index.json").write_text(
        json.dumps(kirjed, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"index.json: {len(kirjed)} turniiri")
    return 0


if __name__ == "__main__":
    sys.exit(main())
