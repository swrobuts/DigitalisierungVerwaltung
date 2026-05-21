interface FieldOptions {
  id: string;
  label: string;
  type?: "text" | "email" | "tel" | "number";
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  validate?: (v: string) => string | null;
  placeholder?: string;
}

export function renderFieldInput(opts: FieldOptions): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "mb-3";

  const label = document.createElement("label");
  label.htmlFor = opts.id;
  label.className = "block text-sm font-medium text-slate-700 mb-1";
  label.textContent = opts.label + (opts.required ? " *" : "");
  wrap.appendChild(label);

  const input = document.createElement("input");
  input.id = opts.id;
  input.type = opts.type ?? "text";
  input.value = opts.value;
  input.placeholder = opts.placeholder ?? "";
  input.className =
    "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
  if (opts.required) input.required = true;
  wrap.appendChild(input);

  const errEl = document.createElement("p");
  errEl.className = "mt-1 text-xs text-rose-600 hidden";
  wrap.appendChild(errEl);

  input.addEventListener("input", () => {
    opts.onChange(input.value);
    if (opts.validate) {
      const err = opts.validate(input.value);
      if (err && input.value.length > 0) {
        errEl.textContent = err;
        errEl.classList.remove("hidden");
        input.classList.add("border-rose-400");
      } else {
        errEl.classList.add("hidden");
        input.classList.remove("border-rose-400");
      }
    }
  });

  return wrap;
}
