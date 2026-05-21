import type { Signal } from "../signals";
import type { FormState } from "../types";
import { formatEuro, formatAdresse } from "../format";
import { t } from "../i18n";

export function renderStep6(
  stateSig: Signal<FormState>,
  onSubmit: () => Promise<void>,
): HTMLElement {
  const root = document.createElement("section");
  root.className = "bg-white p-6 rounded-lg border border-slate-200";

  const h = document.createElement("h2");
  h.className = "text-lg font-semibold mb-4";
  h.textContent = t("uebersicht.titel");
  root.appendChild(h);

  const list = document.createElement("div");
  list.className = "space-y-4 text-sm";
  root.appendChild(list);

  const renderSummary = () => {
    list.innerHTML = "";
    const s = stateSig.value;
    list.appendChild(sectionBlock(stateSig, 1, "Einrichtung & Träger", [
      `${s.name} · ${s.traeger} · Haushaltsjahr ${s.haushaltsjahr}`,
      formatAdresse(s.strasse, s.hausnummer, s.plz, s.ort),
    ]));
    list.appendChild(sectionBlock(stateSig, 2, "Kontakt & Bank", [
      `${s.ansprechpartner} · ${s.telefon}`,
      s.email,
      `${s.bankverbindung} · ${s.iban}${s.bic ? " · " + s.bic : ""}`,
    ]));
    const wp = s.oeffnungszeiten
      .filter((o) => o.oeffnungszeit.trim() || o.angebot.trim())
      .map((o) => `${o.wochentag.toUpperCase()} ${o.oeffnungszeit} ${o.angebot}`)
      .join(" · ");
    list.appendChild(sectionBlock(stateSig, 3, "Öffnungszeiten", [wp || "—"]));
    const sumByTyp = (typ: string) =>
      s.belegpositionen.filter((b) => b.belegtyp === typ).reduce((acc, b) => acc + b.betrag_euro, 0);
    const grand = s.belegpositionen.reduce((acc, b) => acc + b.betrag_euro, 0);
    list.appendChild(sectionBlock(stateSig, 4, "Kosten", [
      `Betriebskosten: ${formatEuro(sumByTyp("betriebskosten"))}`,
      `Personalkosten: ${formatEuro(sumByTyp("personalkosten"))}`,
      `Miete (Jahr): ${formatEuro(sumByTyp("miete"))}`,
      `Gesamt: ${formatEuro(grand)}`,
    ]));
    list.appendChild(sectionBlock(stateSig, 5, "Anlage", [
      s.programm_flyer?.name ?? "—",
    ]));
  };
  renderSummary();
  stateSig.subscribe(renderSummary);

  const checkboxWrap = document.createElement("label");
  checkboxWrap.className = "mt-6 flex items-start gap-2";
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = stateSig.value.bestaetigt;
  cb.addEventListener("change", () => {
    stateSig.value = { ...stateSig.value, bestaetigt: cb.checked };
  });
  checkboxWrap.appendChild(cb);
  const cbLbl = document.createElement("span");
  cbLbl.className = "text-sm";
  cbLbl.textContent = t("uebersicht.bestaetigung");
  checkboxWrap.appendChild(cbLbl);
  root.appendChild(checkboxWrap);

  const submitBtn = document.createElement("button");
  submitBtn.type = "button";
  submitBtn.className = "mt-4 w-full rounded-md bg-rose-700 px-4 py-2 text-white font-semibold hover:bg-rose-800 disabled:opacity-50";
  submitBtn.textContent = t("form.button.absenden");
  const updateBtn = () => {
    submitBtn.disabled = !stateSig.value.bestaetigt;
  };
  updateBtn();
  stateSig.subscribe(updateBtn);
  submitBtn.addEventListener("click", async () => {
    submitBtn.disabled = true;
    submitBtn.textContent = "Wird gesendet …";
    try {
      await onSubmit();
    } catch (e) {
      submitBtn.disabled = false;
      submitBtn.textContent = t("form.button.absenden");
      alert("Fehler beim Absenden: " + (e as Error).message);
    }
  });
  root.appendChild(submitBtn);

  return root;
}

function sectionBlock(
  stateSig: Signal<FormState>,
  step: 1|2|3|4|5,
  title: string,
  lines: string[],
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "border border-slate-200 rounded p-3";
  const header = document.createElement("div");
  header.className = "flex justify-between items-center mb-2";
  const h = document.createElement("p");
  h.className = "font-medium";
  h.textContent = title;
  header.appendChild(h);
  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "text-xs text-blue-700 hover:underline";
  edit.textContent = t("uebersicht.bearbeiten") + " →";
  edit.addEventListener("click", () => {
    stateSig.value = { ...stateSig.value, step };
  });
  header.appendChild(edit);
  wrap.appendChild(header);
  for (const ln of lines) {
    const p = document.createElement("p");
    p.className = "text-xs text-slate-700";
    p.textContent = ln;
    wrap.appendChild(p);
  }
  return wrap;
}
