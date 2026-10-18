/**
 * Accessible text combobox: free text input with a filtered suggestion list.
 * WAI-ARIA combobox pattern (list autocomplete), keyboard: ↑ ↓ Enter Esc.
 */
class Combobox {
  constructor({ input, list, source, describe, onInput, onCommit, onEnter, maxItems = 8 }) {
    this.input = input;
    this.list = list;
    this.source = source; // () => string[]
    this.describe = describe || null; // (value) => string
    this.onInput = onInput || null; // (raw) => void — live typing
    this.onCommit = onCommit || null; // (raw) => void — blur / Enter / pick
    this.onEnter = onEnter || null; // () => void — after Enter commits
    this.maxItems = maxItems;

    this.options = [];
    this.activeIndex = -1;
    this.committed = input.value;

    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-controls", list.id);
    list.setAttribute("role", "listbox");
    list.hidden = true;

    input.addEventListener("input", () => {
      this.open();
      if (this.onInput) this.onInput(this.input.value);
    });
    input.addEventListener("focus", () => this.open());
    input.addEventListener("click", () => this.open());
    input.addEventListener("blur", () => {
      this.close();
      this.commit();
    });
    input.addEventListener("keydown", (e) => this.handleKey(e));

    // Keep focus in the input while picking with the mouse.
    list.addEventListener("mousedown", (e) => e.preventDefault());
    list.addEventListener("click", (e) => {
      const option = e.target.closest('[role="option"]');
      if (option) this.choose(Number(option.dataset.index));
    });
  }

  get isOpen() {
    return !this.list.hidden;
  }

  setValue(value) {
    this.input.value = value;
    this.committed = value;
  }

  refresh() {
    if (this.isOpen) this.open();
  }

  filter() {
    const query = this.input.value.trim().toLowerCase();
    const starts = [];
    const contains = [];
    for (const value of this.source()) {
      const lower = value.toLowerCase();
      if (!query || lower.startsWith(query)) starts.push(value);
      else if (lower.includes(query)) contains.push(value);
    }
    return starts.concat(contains).slice(0, this.maxItems);
  }

  open() {
    const query = this.input.value.trim().toLowerCase();
    this.options = this.filter();
    const onlyExact = this.options.length === 1 && this.options[0].toLowerCase() === query;
    if (!this.options.length || onlyExact) {
      this.close();
      return;
    }

    this.list.replaceChildren(
      ...this.options.map((value, index) => {
        const li = document.createElement("li");
        li.id = `${this.list.id}-opt-${index}`;
        li.className = "combo__option";
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", "false");
        li.dataset.index = String(index);

        const label = document.createElement("span");
        label.className = "combo__label";
        label.textContent = value;
        li.append(label);

        const meta = this.describe ? this.describe(value) : "";
        if (meta) {
          const small = document.createElement("span");
          small.className = "combo__meta";
          small.textContent = meta;
          li.append(small);
        }
        return li;
      })
    );

    this.activeIndex = -1;
    this.input.removeAttribute("aria-activedescendant");
    this.list.hidden = false;
    this.input.setAttribute("aria-expanded", "true");
  }

  close() {
    this.list.hidden = true;
    this.activeIndex = -1;
    this.input.setAttribute("aria-expanded", "false");
    this.input.removeAttribute("aria-activedescendant");
  }

  move(delta) {
    if (!this.isOpen) this.open();
    if (!this.isOpen || !this.options.length) return;
    const n = this.options.length;
    this.activeIndex = this.activeIndex === -1 ? (delta > 0 ? 0 : n - 1) : (this.activeIndex + delta + n) % n;

    Array.from(this.list.children).forEach((li, i) => {
      li.setAttribute("aria-selected", String(i === this.activeIndex));
    });
    const active = this.list.children[this.activeIndex];
    this.input.setAttribute("aria-activedescendant", active.id);
    active.scrollIntoView({ block: "nearest" });
  }

  choose(index) {
    const value = this.options[index];
    if (value === undefined) return;
    this.input.value = value;
    this.close();
    this.commit();
    if (this.onInput) this.onInput(value);
  }

  commit() {
    if (this.input.value === this.committed) return;
    this.committed = this.input.value;
    if (this.onCommit) this.onCommit(this.input.value);
  }

  handleKey(e) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        this.move(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        this.move(-1);
        break;
      case "Enter":
        e.preventDefault();
        if (this.isOpen && this.activeIndex >= 0) {
          this.choose(this.activeIndex);
        } else {
          this.close();
          this.commit();
        }
        if (this.onEnter) this.onEnter();
        break;
      case "Escape":
        if (this.isOpen) {
          e.preventDefault();
          e.stopPropagation();
          this.close();
        }
        break;
      case "Tab":
        this.close();
        break;
      default:
        break;
    }
  }
}

window.Combobox = Combobox;
