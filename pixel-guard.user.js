// ==UserScript==
// @name         Pixel Guard — Gmail
// @namespace    https://github.com/Lorenzo-D-B/Pixel
// @version      0.1.0
// @author       Lorenzo-D-B
// @description  Aiuta a bloccare tracking pixel e immagini di tracciamento su Gmail, con filtro dimensioni e sblocco manuale.
// @homepageURL  https://github.com/Lorenzo-D-B/Pixel
// @supportURL   https://github.com/Lorenzo-D-B/Pixel/issues
// @downloadURL  https://raw.githubusercontent.com/Lorenzo-D-B/Pixel/main/pixel-guard.user.js
// @updateURL    https://raw.githubusercontent.com/Lorenzo-D-B/Pixel/main/pixel-guard.user.js
// @match        https://mail.google.com/*
// @run-at       document-start
// @sandbox      raw
// @grant        none
// @noframes
// @license      MIT
// ==/UserScript==

(() => {
  "use strict";

  const KEY = "pixel-guard:mode:v1";
  const MARK = "data-pixel-guard-blocked";
  const BODY = ".a3s, .ii.gt, [data-message-body]";
  const LIMIT = 10;
  const modes = {
    cautious: "Piccole + dimensioni sconosciute",
    tiny: "Solo piccole (fino a 10 × 10 px)",
    all: "Tutte le immagini remote",
  };
  let mode = "cautious";
  try {
    const saved = localStorage.getItem(KEY);
    if (Object.hasOwn(modes, saved)) mode = saved;
  } catch {
    // Storage can be unavailable; protection still works for the current tab.
  }

  // Retain the native functions so our own writes do not re-enter the hooks.
  const set = Element.prototype.setAttribute;
  const remove = Element.prototype.removeAttribute;
  const append = Node.prototype.appendChild;
  const insert = Node.prototype.insertBefore;
  const html = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
  const records = new Map();
  const approved = new WeakMap();
  const buttons = new WeakMap();
  const tracked = new WeakMap();
  const candidates = new Set();
  let sequence = 0;
  const tokenPrefix = crypto.randomUUID();
  let scheduled = false;
  let panel;
  let counter;
  let select;

  function isRemote(value) {
    if (!value) return false;
    try {
      return /https?:/.test(new URL(value, location.href).protocol);
    } catch {
      return false;
    }
  }

  function remoteSet(value) {
    // Normal Gmail image srcsets use HTTP(S) URLs. Do not parse/fetch images to
    // discover their dimensions; even a HEAD request can trigger a tracker.
    return Boolean(value && /(?:https?:)?\/\//i.test(value));
  }

  function pictureSources(image) {
    return image.parentElement?.localName === "picture"
      ? [...image.parentElement.querySelectorAll(":scope > source")]
      : [];
  }

  function snapshot(image) {
    return {
      src: image.getAttribute("src"),
      srcset: image.getAttribute("srcset"),
      sources: pictureSources(image).map((source) =>
        source.getAttribute("srcset"),
      ),
    };
  }

  function hasRemote(source) {
    return (
      isRemote(source.src) ||
      remoteSet(source.srcset) ||
      source.sources.some(remoteSet)
    );
  }

  function isGmailProxy(source) {
    return /(?:https?:)?\/\/ci\d+\.googleusercontent\.com\//i.test(
      [source.src, source.srcset, ...source.sources].filter(Boolean).join(" "),
    );
  }

  function inMessage(image, context) {
    return Boolean(
      image.closest(BODY) ||
      (context instanceof Element && context.closest(BODY)),
    );
  }

  function dimension(image, name) {
    const values = [image.getAttribute(name), image.style[name]];
    const numbers = values.flatMap((value) => {
      // Percentages, auto, layout defaults and naturalWidth are NOT evidence of
      // an image's size before loading. Accept explicit nonnegative px only.
      if (!value || !/^\s*\d+(?:\.\d+)?(?:px)?\s*$/i.test(value)) return [];
      return [Number.parseFloat(value)];
    });
    return numbers.length ? Math.min(...numbers) : null;
  }

  function reasonFor(image, previous) {
    if (mode === "all") return "immagine remota";
    const width = dimension(image, "width");
    const height = dimension(image, "height");
    const display =
      previous?.display ?? image.style.getPropertyValue("display");
    if (
      width === 0 ||
      height === 0 ||
      image.hasAttribute("hidden") ||
      display === "none" ||
      image.style.visibility === "hidden"
    ) {
      return "immagine nascosta";
    }
    if (width !== null && height !== null) {
      return width <= LIMIT && height <= LIMIT
        ? `immagine piccola (${width} × ${height} px)`
        : null;
    }
    return mode === "cautious" ? "dimensioni sconosciute" : null;
  }

  function signature(source) {
    return JSON.stringify(source);
  }

  function writeAttribute(element, name, value) {
    if (value === null) remove.call(element, name);
    else set.call(element, name, value);
  }

  function restore(image, manually = false, replacement) {
    const record = records.get(image.getAttribute(MARK));
    if (!record) return;
    const source = replacement ?? record.source;
    remove.call(image, MARK);
    if (record.display) {
      image.style.setProperty("display", record.display, record.priority);
    } else {
      image.style.removeProperty("display");
    }
    // Record approval before restoring source attributes.
    if (manually) approved.set(image, signature(source));
    writeAttribute(image, "srcset", source.srcset);
    writeAttribute(image, "src", source.src);
    pictureSources(image).forEach((element, index) => {
      writeAttribute(element, "srcset", source.sources[index] ?? null);
    });
    buttons.get(image)?.remove();
    buttons.delete(image);
  }

  function trackRecord(image, record) {
    const token = image.getAttribute(MARK);
    if (tracked.get(image) === token) return;
    tracked.set(image, token);
    record.owners ??= new Set();
    record.owners.add(new WeakRef(image));
  }

  function inspectImage(image, context) {
    const token = image.getAttribute(MARK);
    let record = records.get(token);
    const current = snapshot(image);
    if (approved.has(image)) {
      if (approved.get(image) === signature(current)) return;
      approved.delete(image);
    }

    // A new src on a previously blocked element is a new decision, not approval.
    if (record && hasRemote(current)) {
      record = {
        ...record,
        owners: new Set(),
        source: {
          src: current.src ?? record.source.src,
          srcset: current.srcset ?? record.source.srcset,
          sources: current.sources.map(
            (value, index) => value ?? record.source.sources[index] ?? null,
          ),
        },
      };
      const nextToken = `${tokenPrefix}:${++sequence}`;
      records.set(nextToken, record);
      set.call(image, MARK, nextToken);
    }

    const source = record?.source ?? current;
    if (!hasRemote(source)) return;
    // Detached Gmail-proxied email images are recognizable even before their
    // message container is attached. Keep account avatars and Gmail UI alone.
    if (!inMessage(image, context) && !isGmailProxy(source)) {
      if (record) restore(image);
      return;
    }
    const reason = reasonFor(image, record);
    if (!reason) {
      if (record) restore(image);
      return;
    }
    if (!record) {
      record = {
        source,
        display: image.style.getPropertyValue("display"),
        priority: image.style.getPropertyPriority("display"),
        reason,
      };
      const id = `${tokenPrefix}:${++sequence}`;
      records.set(id, record);
      set.call(image, MARK, id);
    }
    record.reason = reason;
    trackRecord(image, record);
    remove.call(image, "src");
    remove.call(image, "srcset");
    pictureSources(image).forEach((source) => remove.call(source, "srcset"));
    if (image.style.getPropertyValue("display") !== "none") {
      image.style.setProperty("display", "none", "important");
    }
    if (image.isConnected) addButton(image, record);
  }

  function inspectTree(root, context = root) {
    if (!(root instanceof Node)) return;
    if (root instanceof HTMLImageElement) inspectImage(root, context);
    if (root instanceof HTMLSourceElement) {
      const image = root.parentElement?.querySelector("img");
      if (image) inspectImage(image, context);
    }
    root
      .querySelectorAll?.("img")
      .forEach((image) => inspectImage(image, context));
  }

  function addButton(image, record) {
    let button = buttons.get(image);
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      set.call(button, "data-pixel-guard-reveal", "");
      button.style.cssText =
        "display:inline-block!important;margin:4px!important;padding:6px 9px!important;" +
        "border:1px solid #94a3b8!important;border-radius:6px!important;" +
        "background:#f8fafc!important;color:#334155!important;" +
        "font:12px system-ui,sans-serif!important;cursor:pointer!important;";
      button.title =
        "Mostrare l'immagine può comunicare l'apertura dell'email al mittente.";
      button.addEventListener("click", (event) => {
        if (!event.isTrusted) return;
        event.preventDefault();
        event.stopPropagation();
        restore(image, true);
        refreshPanel();
      });
      buttons.set(image, button);
    }
    const text = `Mostra immagine · ${record.reason}`;
    if (button.textContent !== text) button.textContent = text;
    // A button inside <picture> can interfere with source selection.
    const anchor =
      image.parentElement?.localName === "picture"
        ? image.parentElement
        : image;
    if (!button.isConnected && anchor.parentNode) {
      insert.call(anchor.parentNode, button, anchor.nextSibling);
    }
  }

  function schedule(root) {
    candidates.add(root);
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      const roots = [...candidates];
      candidates.clear();
      roots.forEach((node) => {
        if (node.isConnected) inspectTree(node);
      });
      refreshPanel();
    });
  }

  // Sanitize HTML in an inert template BEFORE assigning it to the live DOM.
  // Preserve native TrustedHTML handling: do not manufacture a permissive
  // Trusted Types policy or break Gmail's own security policy.
  function sanitize(value, context) {
    if (typeof value !== "string" || !/<(?:img|source)\b/i.test(value))
      return value;
    const template = document.createElement("template");
    try {
      html.set.call(template, value);
      inspectTree(template.content, context);
      return html.get.call(template);
    } catch {
      // E.g. an enforced Trusted Types policy: native writes and the observer
      // remain usable, but this HTML path cannot promise pre-request blocking.
      return value;
    }
  }

  function hookProperty(prototype, name, transform) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
    if (!descriptor?.set || !descriptor.configurable) return;
    Object.defineProperty(prototype, name, {
      ...descriptor,
      set(value) {
        const result = transform.call(this, value);
        if (result.handled) return;
        descriptor.set.call(this, result.value);
      },
    });
  }

  function setSource(element, name, value) {
    const image =
      element instanceof HTMLImageElement
        ? element
        : element.parentElement?.querySelector("img");
    if (!image) return false;
    const current = snapshot(image);
    const stored = records.get(image.getAttribute(MARK));
    const source = structuredClone(stored?.source ?? current);
    if (element instanceof HTMLImageElement) source[name] = String(value);
    else {
      const index = pictureSources(image).indexOf(element);
      if (index < 0) return false;
      source.sources[index] = String(value);
    }
    if (approved.has(image) && signature(source) === approved.get(image))
      return false;
    approved.delete(image);
    if (
      !hasRemote(source) ||
      (!inMessage(image) && !isGmailProxy(source)) ||
      !reasonFor(image, stored)
    ) {
      // Remove a stale block before the caller applies the replacement source.
      if (stored) restore(image, false, source);
      return false;
    }
    const record = {
      source,
      display: stored?.display ?? image.style.getPropertyValue("display"),
      priority: stored?.priority ?? image.style.getPropertyPriority("display"),
      reason: reasonFor(image, stored),
    };
    const token = `${tokenPrefix}:${++sequence}`;
    records.set(token, record);
    set.call(image, MARK, token);
    remove.call(image, "src");
    remove.call(image, "srcset");
    pictureSources(image).forEach((source) => remove.call(source, "srcset"));
    // The original source setter is deliberately never called for a block.
    inspectImage(image);
    schedule(image);
    return true;
  }

  for (const name of ["src", "srcset"]) {
    hookProperty(HTMLImageElement.prototype, name, function (value) {
      return { handled: setSource(this, name, value), value };
    });
  }
  hookProperty(HTMLSourceElement.prototype, "srcset", function (value) {
    return { handled: setSource(this, "srcset", value), value };
  });

  Element.prototype.setAttribute = function (name, value) {
    const key = String(name).toLowerCase();
    if (
      ((this instanceof HTMLImageElement && ["src", "srcset"].includes(key)) ||
        (this instanceof HTMLSourceElement && key === "srcset")) &&
      setSource(this, key, value)
    ) {
      return;
    }
    return set.call(this, name, value);
  };
  const setNS = Element.prototype.setAttributeNS;
  Element.prototype.setAttributeNS = function (namespace, name, value) {
    const key = String(name).toLowerCase();
    if (
      (namespace === null || namespace === "") &&
      ((this instanceof HTMLImageElement && ["src", "srcset"].includes(key)) ||
        (this instanceof HTMLSourceElement && key === "srcset")) &&
      setSource(this, key, value)
    )
      return;
    return setNS.call(this, namespace, name, value);
  };

  for (const name of ["innerHTML", "outerHTML"]) {
    hookProperty(Element.prototype, name, function (value) {
      return {
        handled: false,
        value: sanitize(
          value,
          name === "outerHTML" ? this.parentElement : this,
        ),
      };
    });
  }
  const adjacentHTML = Element.prototype.insertAdjacentHTML;
  Element.prototype.insertAdjacentHTML = function (position, value) {
    const outside = /^(beforebegin|afterend)$/i.test(position);
    return adjacentHTML.call(
      this,
      position,
      sanitize(value, outside ? this.parentElement : this),
    );
  };

  // Cover common DOM construction paths before native insertion starts loads.
  for (const name of ["appendChild", "insertBefore", "replaceChild"]) {
    const original = Node.prototype[name];
    Node.prototype[name] = function (node, ...rest) {
      inspectTree(node, this);
      const result = original.call(this, node, ...rest);
      schedule(this);
      return result;
    };
  }
  for (const prototype of [Element.prototype, DocumentFragment.prototype]) {
    for (const name of [
      "append",
      "prepend",
      "replaceChildren",
      "before",
      "after",
      "replaceWith",
    ]) {
      const original = prototype[name];
      if (!original) continue;
      prototype[name] = function (...nodes) {
        const context = ["before", "after", "replaceWith"].includes(name)
          ? this.parentElement
          : this;
        nodes.forEach((node) => inspectTree(node, context));
        const result = original.apply(this, nodes);
        schedule(context ?? this);
        return result;
      };
    }
  }
  const adjacentElement = Element.prototype.insertAdjacentElement;
  Element.prototype.insertAdjacentElement = function (position, element) {
    const outside = /^(beforebegin|afterend)$/i.test(position);
    inspectTree(element, outside ? this.parentElement : this);
    const result = adjacentElement.call(this, position, element);
    schedule(this.parentElement ?? this);
    return result;
  };

  function refreshPanel() {
    if (!document.body) return;
    if (!panel) {
      panel = document.createElement("aside");
      set.call(panel, "data-pixel-guard-panel", "");
      panel.style.cssText =
        "position:fixed!important;bottom:16px!important;left:16px!important;" +
        "z-index:2147483647!important;display:block!important;";
      const shadow = panel.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent =
        ":host{all:initial}section{font:12px system-ui,sans-serif;color:#e2e8f0;" +
        "background:#182234;border:1px solid #475569;border-radius:12px;" +
        "padding:12px;box-shadow:0 6px 24px #0003;max-width:310px}" +
        "header{display:flex;align-items:center;justify-content:space-between;gap:16px}" +
        "strong{font-size:14px}summary{cursor:pointer;margin-top:9px}" +
        "select{display:block;max-width:100%;margin-top:6px;padding:6px;" +
        "border:1px solid #64748b;border-radius:5px;background:#fff;color:#182234}" +
        "p{line-height:1.45;margin:8px 0 0;color:#cbd5e1}";
      const section = document.createElement("section");
      section.setAttribute("aria-label", "Pixel Guard");
      const header = document.createElement("header");
      const title = document.createElement("strong");
      title.textContent = "Pixel Guard";
      counter = document.createElement("span");
      counter.setAttribute("role", "status");
      append.call(header, title);
      append.call(header, counter);
      append.call(section, header);
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = "Protezione immagini";
      append.call(details, summary);
      const label = document.createElement("label");
      label.textContent = "Blocca:";
      select = document.createElement("select");
      select.setAttribute("aria-label", "Modalità di blocco");
      for (const [value, text] of Object.entries(modes)) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = text;
        append.call(select, option);
      }
      select.value = mode;
      select.addEventListener("change", (event) => {
        if (!event.isTrusted || !Object.hasOwn(modes, select.value)) return;
        mode = select.value;
        try {
          localStorage.setItem(KEY, mode);
        } catch {
          // Keep the selection for this tab even without persistent storage.
        }
        inspectTree(document);
        refreshPanel();
      });
      append.call(label, select);
      append.call(details, label);
      const note = document.createElement("p");
      note.textContent =
        "Il filtro usa le dimensioni dichiarate, senza scaricare le immagini. " +
        "Una modalità meno restrittiva può caricare immagini già bloccate. " +
        "Anche immagini grandi possono tracciare. Per la protezione più forte, " +
        "attiva anche “Chiedi prima di visualizzare immagini esterne” in Gmail. " +
        "Mostrare un’immagine può segnalare l’apertura al mittente.";
      append.call(details, note);
      append.call(section, details);
      append.call(shadow, style);
      append.call(shadow, section);
    }
    if (!panel.isConnected) append.call(document.body, panel);
    const count = document.querySelectorAll(`img[${MARK}]`).length;
    const text = `${count} ${count === 1 ? "bloccata" : "bloccate"}`;
    if (counter.textContent !== text) counter.textContent = text;
  }

  const observer = new MutationObserver((changes) => {
    for (const change of changes) {
      if (change.type === "attributes") schedule(change.target);
      else {
        change.addedNodes.forEach((node) => {
          if (node instanceof Element && node !== panel) schedule(node);
        });
      }
    }
    // A removed/replaced message also changes the count; do not retain bodies.
    if (changes.some((change) => change.removedNodes.length))
      schedule(document);
  });
  observer.observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["src", "srcset", "width", "height", "style", "hidden"],
  });
  schedule(document);

  // Sanitized HTML carries opaque tokens, never tracking URLs in data attrs.
  // Weak references also preserve metadata for detached Gmail message caches,
  // without keeping discarded messages alive.
  setInterval(() => {
    for (const [token, record] of records) {
      let alive = false;
      for (const reference of record.owners ?? []) {
        const owner = reference.deref();
        if (owner?.getAttribute(MARK) === token) alive = true;
        else record.owners.delete(reference);
      }
      if (!alive) records.delete(token);
    }
  }, 60_000);
})();
