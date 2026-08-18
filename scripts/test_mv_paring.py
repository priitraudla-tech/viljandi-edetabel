"""Test: kas MV-päring talub tournatedi ajutisi tõrkeid?

Käivita:  python scripts/test_mv_paring.py

Miks see olemas on: tournated on võõras teenus, mida pärime iga 30 min.
18.08.2026 kell 09:01 UTC kukkus jooks läbi, kuigi kaheksa eelmist olid
õnnestunud ja kümme minutit hiljem töötas kõik jälle — ehk ühekordne tõrge
teisel pool juhet. Sellised ei tohi tervet jooksu maha võtta, PÜSIV tõrge
aga peab, et vigased andmed ei kirjutaks head seisu üle.

See kood jookseb ainult siis, kui midagi on juba katki — seepärast on tal
eraldi test. Võrguühendust see test EI kasuta.
"""

import io
import sys
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import mv_fetch as mf  # noqa: E402

HEA = {"data": {"drawsDetail": {"total": 1, "draws": []}}}
vigu = 0


def chk(nimi, ok, lisa=""):
    global vigu
    if not ok:
        vigu += 1
    print(f"  [{'OK  ' if ok else 'VIGA'}] {nimi}{(' - ' + lisa) if lisa else ''}")


def http_viga(kood, sonum=b"x"):
    return urllib.error.HTTPError("url", kood, str(kood), {}, io.BytesIO(sonum))


def loenda(kaitumine):
    """Asenda _paring loenduriga; tagasta (katsete arv, veateade või None)."""
    katsed = []

    def fake(segment):
        katsed.append(segment)
        return kaitumine(len(katsed))

    mf._paring = fake
    try:
        mf.graphql("MD")
        return len(katsed), None
    except RuntimeError as e:
        return len(katsed), str(e)


mf.time.sleep = lambda s: None  # testis ei oota

print("Ajutine tõrge:")
n, viga = loenda(lambda i: HEA if i >= 3 else (_ for _ in ()).throw(
    urllib.error.URLError("ajutine")))
chk("kaks tõrget, kolmas katse õnnestub", n == 3 and viga is None, f"katseid={n}")

print("\nPüsiv tõrge:")
n, viga = loenda(lambda i: (_ for _ in ()).throw(urllib.error.URLError("maas")))
chk("kolm katset, siis viga", n == mf.KATSEID and viga is not None, f"katseid={n}")
chk("veateade ütleb katsete arvu", viga and f"{mf.KATSEID} katsega" in viga)

print("\nHTTP-koodid:")
n, _ = loenda(lambda i: (_ for _ in ()).throw(http_viga(500)))
chk("500 (serveri viga) -> korratakse", n == mf.KATSEID, f"katseid={n}")

n, _ = loenda(lambda i: (_ for _ in ()).throw(http_viga(503)))
chk("503 (teenus maas) -> korratakse", n == mf.KATSEID, f"katseid={n}")

n, _ = loenda(lambda i: (_ for _ in ()).throw(http_viga(429)))
chk("429 (liiga palju päringuid) -> korratakse", n == mf.KATSEID, f"katseid={n}")

n, viga = loenda(lambda i: (_ for _ in ()).throw(http_viga(404, b"pole olemas")))
chk("404 -> EI korrata (päris viga)", n == 1, f"katseid={n}")
chk("veateade sisaldab HTTP koodi", viga and "404" in viga, (viga or "")[:60])

print("\nGraphQL viga vastuse kehas:")
n, viga = loenda(lambda i: {"errors": [{"message": "Introspection is disabled"}]})
chk("korratakse", n == mf.KATSEID, f"katseid={n}")
chk("põhjus säilib veateates", viga and "Introspection" in viga, (viga or "")[:70])

print("\n" + ("KORRAS: paring talub ajutisi torkeid."
              if not vigu else f"VIGA: {vigu} kontrolli kukkus labi."))
sys.exit(1 if vigu else 0)
