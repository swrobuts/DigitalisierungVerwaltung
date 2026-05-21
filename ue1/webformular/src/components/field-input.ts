interface FieldOptions {
  id: string;
  label: string;
  type?: "text" | "email" | "tel" | "number" | "date";
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  validate?: (v: string) => string | null;
  placeholder?: string;
  /** Wenn true, span't das Feld die ganze Grid-Breite (.full). */
  full?: boolean;
}

/**
 * Würzburg-CI-konformes Markup:
 *   <label class="full?">
 *     <span class="field-label">Beschriftung <span class="pflicht">*</span></span>
 *     <input ... />
 *     <span class="field-error" data-error-for="id"></span>
 *   </label>
 *
 * Das Styling kommt komplett aus styles.css (siehe label{display:block},
 * .field-label, input{border, focus-glow, aria-invalid}). Keine Tailwind-
 * Klassen hier — die würden mit der CI kollidieren.
 */
export function renderFieldInput(opts: FieldOptions): HTMLElement {
  const wrap = document.createElement("label");
  wrap.htmlFor = opts.id;
  if (opts.full) wrap.className = "full";

  const lbl = document.createElement("span");
  lbl.className = "field-label";
  const txt = document.createElement("span");
  txt.textContent = opts.label;
  lbl.appendChild(txt);
  if (opts.required) {
    const star = document.createElement("span");
    star.className = "pflicht";
    star.textContent = " *";
    lbl.appendChild(star);
  }
  wrap.appendChild(lbl);

  const input = document.createElement("input");
  input.id = opts.id;
  input.type = opts.type ?? "text";
  input.name = opts.id;
  input.value = opts.value;
  if (opts.placeholder) input.placeholder = opts.placeholder;
  if (opts.required) input.required = true;
  wrap.appendChild(input);

  const errEl = document.createElement("span");
  errEl.className = "field-error";
  errEl.dataset.errorFor = opts.id;
  wrap.appendChild(errEl);

  input.addEventListener("input", () => {
    opts.onChange(input.value);
    if (opts.validate) {
      const err = opts.validate(input.value);
      if (err && input.value.length > 0) {
        errEl.textContent = err;
        input.setAttribute("aria-invalid", "true");
      } else {
        errEl.textContent = "";
        input.removeAttribute("aria-invalid");
      }
    }
  });

  return wrap;
}
