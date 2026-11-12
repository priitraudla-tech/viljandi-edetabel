// Fellin Rackets — ühine skript kõigile lehtedele.
// Iga osa käivitub ainult siis, kui lehel on vastav element olemas.
// Põhisisu (hinnad, treenerid, KKK, edetabeli viimane seis) on HTML-is ja loetav ka ilma skriptita.
(function () {
  "use strict";

  const EDETABEL = "https://viljandi-edetabel.pages.dev";
  const TZ = "Europe/Tallinn";
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtKuupaev = (iso) => new Intl.DateTimeFormat("et-EE", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
  const fmtAeg = (iso) => new Intl.DateTimeFormat("et-EE", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

  // ---------- Seaded (seaded.js): väliväljakute hooaeg ja teateriba ----------
  const SEADED = window.FELLIN_SEADED || {};
  const hooaeg = SEADED.valihooaeg || { algus: "01.05", lopp: "31.10", silt: "mai–oktoober" };
  // Tänane kuupäev Tallinna aja järgi kujul kk*100 + pp, et vahemikku oleks lihtne võrrelda
  const osad = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "2-digit", month: "2-digit" }).formatToParts(new Date());
  const tana = Number(osad.find((o) => o.type === "month").value) * 100 + Number(osad.find((o) => o.type === "day").value);
  const arv = (ppkk) => { const [pp, kk] = String(ppkk).split(".").map(Number); return kk * 100 + pp; };
  const valjasAvatud = tana >= arv(hooaeg.algus) && tana <= arv(hooaeg.lopp);
  document.querySelectorAll("[data-hooaeg]").forEach((el) => {
    el.textContent = valjasAvatud ? `Avatud · hooaeg ${hooaeg.silt}` : `Praegu suletud · hooaeg ${hooaeg.silt}`;
    el.classList.toggle("off", !valjasAvatud);
  });
  // Hinnalehel on väliväljakute plokk hooajal lahti, hooajavälisel ajal kokku pandud
  const valiPlokk = $("#valjas");
  if (valiPlokk && valjasAvatud) valiPlokk.open = true;
  // Teateriba ainult siis, kui seadetes on teade
  const teade = $("#teade");
  if (teade && SEADED.teade) { teade.querySelector("span").textContent = SEADED.teade; teade.hidden = false; }

  // ---------- Mobiilimenüü (avatav loend, mitte ARIA menüü) ----------
  const nupp = $("#menu-btn"), menuu = $("#mobile-menu");
  if (nupp && menuu) {
    const sea = (lahti, fookus) => {
      menuu.hidden = !lahti;
      nupp.setAttribute("aria-expanded", String(lahti));
      if (!lahti && fookus) nupp.focus();
    };
    nupp.addEventListener("click", () => sea(menuu.hidden));
    menuu.addEventListener("click", (e) => { if (e.target.closest("a")) sea(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menuu.hidden) sea(false, true); });
    document.addEventListener("click", (e) => { if (!menuu.hidden && !e.target.closest(".top")) sea(false); });
    matchMedia("(min-width: 901px)").addEventListener("change", (e) => { if (e.matches) sea(false); });
  }

  // ---------- VÜS edetabel ja püramiid: värske seis peale, värskus ausalt näha ----------
  const vusList = $("#vus-list"), pyrList = $("#pyr-list"), pyrTop = $("#pyr-top"), olekEl = $("#data-status");
  function delta(d) {
    if (d > 0) return `<span class="dl up"><span aria-hidden="true">▲</span>${d}<span class="vh"> kohta üles</span></span>`;
    if (d < 0) return `<span class="dl down"><span aria-hidden="true">▼</span>${-d}<span class="vh"> kohta alla</span></span>`;
    return `<span class="dl eq"><span aria-hidden="true">—</span><span class="vh">muutuseta</span></span>`;
  }
  function trend(d) {
    if (d > 0) return `<span class="k-trend up"><span aria-hidden="true">▲</span>${d}<span class="vh"> kohta üles</span></span>`;
    if (d < 0) return `<span class="k-trend down"><span aria-hidden="true">▼</span>${-d}<span class="vh"> kohta alla</span></span>`;
    return `<span class="k-trend eq"><span aria-hidden="true">—</span><span class="vh">muutuseta</span></span>`;
  }
  function olek(tyyp, html) {
    if (!olekEl) return;
    olekEl.className = "data-status " + tyyp;
    olekEl.innerHTML = html;
  }
  async function laeJson(tee, signal) {
    const r = await fetch(EDETABEL + tee, { signal, cache: "no-cache" });
    if (!r.ok) throw new Error(r.status);
    return r.json();
  }
  if (vusList || pyrList || pyrTop) {
    (async function () {
      const varuSeis = olekEl ? olekEl.dataset.asof : "";
      try {
        const ctl = new AbortController();
        setTimeout(() => ctl.abort(), 6000);
        const [cur, pyr] = await Promise.all([
          vusList ? laeJson("/data/current.json", ctl.signal) : null,
          pyrList || pyrTop ? laeJson("/data/puramiid.json", ctl.signal) : null,
        ]);
        let asof = "";
        if (cur) {
          asof = (cur.title.match(/\(([\d.]+)/) || [])[1] || "";
          const n = Number(vusList.dataset.n) || 5;
          const top = cur.players.slice(0, n);
          const tabloo = vusList.dataset.stiil === "tabloo";
          vusList.innerHTML = top.length ? top.map((p, i) => tabloo
            ? `<li class="k-row"><span class="k-pos" aria-hidden="true">${i + 1}</span><span class="k-name">${esc(p.name)}` +
              `${i === 0 ? ' <span class="k-lead">liider</span>' : ""}</span><span class="k-pts num">${p.total}<small>p</small></span>${trend(p.rank_delta || 0)}</li>`
            : `<li><span class="rk num" aria-hidden="true">${String(i + 1).padStart(2, "0")}</span><span>${esc(p.name)}</span>` +
              `<span class="pts num">${p.total} p</span>${delta(p.rank_delta || 0)}</li>`).join("")
            : `<li><span class="empty">Tulemusi veel pole.</span></li>`;
          const a = $("#vus-asof");
          if (a) a.textContent = asof ? `seis ${asof}` : "seis";
        }
        if (pyr) {
          const jarjest = pyr.players.slice().sort((x, y) => x.pos - y.pos);
          const seis = pyr.updated_at ? fmtKuupaev(pyr.updated_at) : "";
          if (pyrList) {
            const n = Number(pyrList.dataset.n) || 5;
            const tabloo = pyrList.dataset.stiil === "tabloo";
            pyrList.innerHTML = jarjest.length ? jarjest.slice(0, n).map((p, i) => tabloo
              ? `<li class="k-row pyr"><span class="k-pos" aria-hidden="true">${i + 1}</span><span class="k-name">${esc(p.name)}` +
                `${i === 0 ? ' <span class="k-lead">tipp</span>' : ""}</span></li>`
              : `<li class="pyr"><span class="rk num" aria-hidden="true">${String(i + 1).padStart(2, "0")}</span>` +
                `<span>${esc(p.name)}${i === 0 ? ' <span aria-hidden="true">👑</span><span class="vh">(püramiidi tipp)</span>' : ""}</span></li>`).join("")
              : `<li><span class="empty">Püramiidis pole veel mängijaid.</span></li>`;
            const a = $("#pyr-asof");
            if (a && seis) a.textContent = `seis ${seis}`;
          }
          if (pyrTop) pyrTop.textContent = jarjest[0] ? `Tipus ${jarjest[0].name}${seis ? ` · seis ${seis}` : ""}` : "Püramiidis pole veel mängijaid";
        }
        if (cur) olek("ok", `<span><b>Seis ${esc(asof || "—")}</b>` +
          `${cur.fetched_at ? `<span class="kontroll">Andmed kontrollitud ${esc(fmtAeg(cur.fetched_at))}</span>` : ""}</span>`);
      } catch (e) {
        olek("error", `Edetabeliga ei saanud ühendust. Näitan viimast teadaolevat seisu (${esc(varuSeis)}).`);
      }
    })();
  }

  // ---------- E-posti aadressi kopeerimine (nupp ilmub ainult siis, kui lõikelaud on kasutatav) ----------
  document.querySelectorAll(".copy-btn").forEach((btn) => {
    if (!navigator.clipboard || !window.isSecureContext) return;
    btn.hidden = false;
    const teade = btn.parentElement.querySelector(".copy-ok");
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy);
        teade.textContent = "Aadress kopeeritud";
      } catch (e) {
        // Lõikelaud keelatud: vali aadress ära, et selle saaks käsitsi kopeerida
        const r = document.createRange();
        r.selectNodeContents(btn.parentElement.querySelector("a"));
        getSelection().removeAllRanges();
        getSelection().addRange(r);
        teade.textContent = "Aadress on valitud — kopeeri see käsitsi";
      }
      clearTimeout(btn._t);
      btn._t = setTimeout(() => { teade.textContent = ""; }, 4000);
    });
  });

  // ---------- Google'i kaart alles nupuvajutusel (küpsised ainult nõusolekul) ----------
  const kaartNupp = $("#map-load");
  if (kaartNupp) {
    kaartNupp.addEventListener("click", () => {
      const box = $("#map");
      box.classList.add("on");
      box.innerHTML = '<iframe title="Viljandi Tennis – tennisehall, väliväljakud ja klubi kontor kaardil" ' +
        'src="https://www.google.com/maps/d/embed?mid=1edaLlcJRuS-RaN6xDFF_qVSuKz4"></iframe>';
      box.querySelector("iframe").focus();
    });
  }
})();
