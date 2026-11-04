import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const script = readFileSync(
  new URL("../pixel-guard.user.js", import.meta.url),
  "utf8",
);
const origin = "https://mail.google.com/mail/u/0/";
const tracker = "https://ci3.googleusercontent.com/proxy/pixel-test";
const direct = "https://tracking.example.test/open.gif";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1kAAAAASUVORK5CYII=",
  "base64",
);
const pageErrors = new WeakMap();

test.beforeEach(async ({ page }) => {
  const errors = [];
  pageErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
});

test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

async function openGmail(
  page,
  { mode, initial = "", trustedTypes = false } = {},
) {
  const requests = [];
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (url === origin) {
      await route.fulfill({
        contentType: "text/html",
        headers: trustedTypes
          ? { "Content-Security-Policy": "require-trusted-types-for 'script'" }
          : {},
        body: `<!doctype html><html><head><title>Gmail fixture</title></head><body>
          <main><div class="a3s" id="message">${initial}</div></main>
          <div id="gmail-ui"></div></body></html>`,
      });
    } else {
      requests.push(url);
      await route.fulfill({ contentType: "image/png", body: png });
    }
  });
  if (mode) {
    await page.addInitScript((value) => {
      localStorage.setItem("pixel-guard:mode:v1", value);
    }, mode);
  }
  await page.addInitScript({ content: script });
  await page.goto(origin);
  await expect(page.locator("[data-pixel-guard-panel]")).toBeVisible();
  return requests;
}

async function flush(page) {
  // RequestAnimationFrame alone is not a network barrier. Wait through load
  // scheduling and confirm the rendered blocking UI as well as request counts.
  await page.waitForTimeout(200);
}

async function changeMode(page, mode) {
  // selectOption synthesizes an untrusted change event. Exercise the same
  // trusted keyboard path as a person, since privacy changes require input.
  const select = page.getByLabel("Modalità di blocco");
  await select.focus();
  await select.press("Home");
  if (mode === "tiny") await select.press("ArrowDown");
  if (mode === "all") await select.press("End");
  await expect(select).toHaveValue(mode);
}

test("blocks 1×1 and 10×10 HTML images before requests, permits a declared large image", async ({
  page,
}) => {
  const requests = await openGmail(page);
  await page.locator("#message").evaluate((body, url) => {
    body.innerHTML = `<img width="1" height="1" src="${url}?one">
      <img style="width:10px;height:10px" src="${url}?ten">
      <img width="11" height="11" src="${url}?large">`;
  }, tracker);
  await expect(page.locator("[data-pixel-guard-reveal]")).toHaveCount(2);
  await flush(page);
  expect(requests).toEqual([`${tracker}?large`]);
  await expect(
    page.locator("[data-pixel-guard-panel]").getByRole("status"),
  ).toHaveText("2 bloccate");
});

test("blocks unknown dimensions without probing their URL", async ({
  page,
}) => {
  const requests = await openGmail(page);
  await page.locator("#message").evaluate((body, url) => {
    body.innerHTML = `<img src="${url}"><img width="100%" src="${url}?percent">`;
  }, direct);
  await expect(
    page.getByRole("button", { name: /dimensioni sconosciute/ }),
  ).toHaveCount(2);
  await flush(page);
  expect(requests).toEqual([]);
});

test("intercepts live src, srcset, setAttribute and setAttributeNS writes", async ({
  page,
}) => {
  const requests = await openGmail(page);
  await page.locator("#message").evaluate((body, url) => {
    for (const method of ["src", "srcset", "attribute", "namespace"]) {
      const image = document.createElement("img");
      image.width = 1;
      image.height = 1;
      body.appendChild(image);
      if (method === "src") image.src = `${url}?src`;
      if (method === "srcset") image.srcset = `${url}?srcset 1x`;
      if (method === "attribute") image.setAttribute("src", `${url}?attribute`);
      if (method === "namespace")
        image.setAttributeNS(null, "src", `${url}?namespace`);
    }
  }, direct);
  await expect(page.locator("[data-pixel-guard-reveal]")).toHaveCount(4);
  await flush(page);
  expect(requests).toEqual([]);
});

test("handles detached Gmail proxy images and inserted message containers", async ({
  page,
}) => {
  const requests = await openGmail(page);
  await page.evaluate((url) => {
    const image = document.createElement("img");
    image.src = `${url}?detached`;
    image.width = 1;
    image.height = 1;
    document.querySelector("#message").append(image);
    const container = document.createElement("div");
    container.className = "a3s";
    container.innerHTML = `<img src="${url}?container" width="2" height="2">`;
    document.body.append(container);
  }, tracker);
  await expect(page.locator("[data-pixel-guard-reveal]")).toHaveCount(2);
  await flush(page);
  expect(requests).toEqual([]);
});

test("sanitizes insertAdjacentHTML, outerHTML and DocumentFragment insertion", async ({
  page,
}) => {
  const requests = await openGmail(page);
  await page.locator("#message").evaluate((body, url) => {
    body.insertAdjacentHTML(
      "beforeend",
      `<img width="1" height="1" src="${url}?adjacent">`,
    );
    const span = document.createElement("span");
    body.appendChild(span);
    span.outerHTML = `<img width="1" height="1" src="${url}?outer">`;
    const template = document.createElement("template");
    template.innerHTML = `<img width="1" height="1" src="${url}?fragment">`;
    body.replaceChildren(...body.childNodes, template.content);
  }, direct);
  await expect(page.locator("[data-pixel-guard-reveal]")).toHaveCount(3);
  await flush(page);
  expect(requests).toEqual([]);
});

test("blocks responsive picture sources before selection", async ({ page }) => {
  const requests = await openGmail(page);
  await page.locator("#message").evaluate((body, url) => {
    body.innerHTML = `<picture><source srcset="${url}?source 1x">
      <img src="${url}?fallback" width="1" height="1"></picture>`;
  }, direct);
  await expect(page.locator("[data-pixel-guard-reveal]")).toHaveCount(1);
  await flush(page);
  expect(requests).toEqual([]);
  await page.getByRole("button", { name: /Mostra immagine/ }).click();
  await flush(page);
  expect(requests).toContain(`${direct}?source`);
});

test("manual reveal loads only the chosen image; synthetic clicks cannot approve", async ({
  page,
}) => {
  const requests = await openGmail(page);
  await page.locator("#message").evaluate((body, url) => {
    body.innerHTML = `<img src="${url}?first" width="1" height="1">
      <img src="${url}?second" width="1" height="1">`;
  }, tracker);
  const buttons = page.locator("[data-pixel-guard-reveal]");
  await expect(buttons).toHaveCount(2);
  await buttons.first().evaluate((button) => button.click());
  await flush(page);
  expect(requests).toEqual([]);
  await buttons.first().click();
  await expect(buttons).toHaveCount(1);
  await flush(page);
  expect(requests).toEqual([`${tracker}?first`]);
  await expect(
    page.locator("[data-pixel-guard-panel]").getByRole("status"),
  ).toHaveText("1 bloccata");
});

test("a new source on an approved image is blocked again", async ({ page }) => {
  const requests = await openGmail(page);
  await page.locator("#message").evaluate((body, url) => {
    body.innerHTML = `<img id="reused" src="${url}?approved" width="1" height="1">`;
  }, tracker);
  await page.getByRole("button", { name: /Mostra immagine/ }).click();
  await flush(page);
  await page.locator("#reused").evaluate((image, url) => {
    image.src = `${url}?new-tracker`;
  }, tracker);
  await expect(page.locator("[data-pixel-guard-reveal]")).toHaveCount(1);
  await flush(page);
  expect(requests).toEqual([`${tracker}?approved`]);
});

test("replacing a blocked URL with a local image never loads the old URL", async ({
  page,
}) => {
  const requests = await openGmail(page);
  await page.locator("#message").evaluate((body, url) => {
    body.innerHTML = `<img id="replaced" src="${url}" width="1" height="1">`;
  }, tracker);
  await expect(page.locator("[data-pixel-guard-reveal]")).toHaveCount(1);
  await page.locator("#replaced").evaluate((image) => {
    image.src =
      "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  });
  await expect(page.locator("[data-pixel-guard-reveal]")).toHaveCount(0);
  await flush(page);
  expect(requests).toEqual([]);
});

test("leaves Gmail UI and local email images alone", async ({ page }) => {
  const requests = await openGmail(page);
  await page.locator("#gmail-ui").evaluate((body) => {
    body.innerHTML =
      '<img src="https://avatars.example.test/avatar.png" width="1" height="1">';
  });
  await page.locator("#message").evaluate((body) => {
    body.innerHTML =
      '<img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" width="1" height="1">';
  });
  await flush(page);
  await expect(page.locator("[data-pixel-guard-reveal]")).toHaveCount(0);
  expect(requests).toEqual(["https://avatars.example.test/avatar.png"]);
});

test("tiny-only mode permits unknown sizes but blocks hidden and small images", async ({
  page,
}) => {
  const requests = await openGmail(page, { mode: "tiny" });
  await page.locator("#message").evaluate((body, url) => {
    body.innerHTML = `<img src="${url}?unknown"><img width="1" height="1" src="${url}?small">
      <img width="600" height="100" style="display:none" src="${url}?hidden">`;
  }, tracker);
  await expect(page.locator("[data-pixel-guard-reveal]")).toHaveCount(2);
  await flush(page);
  expect(requests).toEqual([`${tracker}?unknown`]);
});

test("all-images mode blocks declared large images and persists the setting", async ({
  page,
}) => {
  const requests = await openGmail(page);
  await page.getByText("Protezione immagini", { exact: true }).click();
  await changeMode(page, "all");
  await page.locator("#message").evaluate((body, url) => {
    body.innerHTML = `<img width="600" height="300" src="${url}">`;
  }, tracker);
  await expect(page.locator("[data-pixel-guard-reveal]")).toHaveCount(1);
  await flush(page);
  expect(requests).toEqual([]);
  await page.reload();
  await page.getByText("Protezione immagini", { exact: true }).click();
  await expect(page.getByLabel("Modalità di blocco")).toHaveValue("all");
});

test("loosening the mode restores only newly permitted images", async ({
  page,
}) => {
  const requests = await openGmail(page);
  await page.locator("#message").evaluate((body, url) => {
    body.innerHTML = `<img src="${url}?unknown"><img width="1" height="1" src="${url}?small">`;
  }, tracker);
  await expect(page.locator("[data-pixel-guard-reveal]")).toHaveCount(2);
  await page.getByText("Protezione immagini", { exact: true }).click();
  await changeMode(page, "tiny");
  await expect(page.locator("[data-pixel-guard-reveal]")).toHaveCount(1);
  await flush(page);
  expect(requests).toEqual([`${tracker}?unknown`]);
});

test("a removed message is no longer counted", async ({ page }) => {
  await openGmail(page);
  await page.locator("#message").evaluate((body, url) => {
    body.innerHTML = `<img src="${url}" width="1" height="1">`;
  }, tracker);
  await expect(page.locator("[data-pixel-guard-reveal]")).toHaveCount(1);
  await page.locator("#message").evaluate((body) => body.replaceChildren());
  await expect(
    page.locator("[data-pixel-guard-panel]").getByRole("status"),
  ).toHaveText("0 bloccate");
});

test("native TrustedHTML remains functional and live source setters are still protected", async ({
  page,
}) => {
  const requests = await openGmail(page, { trustedTypes: true });
  await page.locator("#message").evaluate((body, url) => {
    const policy = trustedTypes.createPolicy("gmail-test", {
      createHTML: (html) => html,
    });
    body.innerHTML = policy.createHTML(
      '<p id="trusted">Trusted HTML works</p>',
    );
    const image = document.createElement("img");
    image.width = 1;
    image.height = 1;
    body.appendChild(image);
    image.src = url;
  }, tracker);
  await expect(page.locator("#trusted")).toHaveText("Trusted HTML works");
  await expect(page.locator("[data-pixel-guard-reveal]")).toHaveCount(1);
  await flush(page);
  expect(requests).toEqual([]);
});

test("documents the boundary: a parser-started request cannot be undone", async ({
  page,
}) => {
  const requests = await openGmail(page, {
    initial: `<img src="${tracker}?initial-parser" width="1" height="1">`,
  });
  await expect(page.locator("[data-pixel-guard-reveal]")).toHaveCount(1);
  await flush(page);
  // This is a limitation test, not a claim that initial parser loads are blocked.
  expect(requests).toContain(`${tracker}?initial-parser`);
});
