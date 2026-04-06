const fs = require("fs");
const path = require("path");
const { chromium, devices } = require("playwright");

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3000/tools/gerador-atividades";
const WAIT_AFTER_LOAD_MS = 8000;
const ARTIFACT_DIR = path.join(process.cwd(), "tmp-preview-audit");
const CATEGORY_NAMES = [
  "Aritm\u00E9tica",
  "Fra\u00E7\u00F5es",
  "Equa\u00E7\u00F5es 1\u00BA Grau",
  "Potencia\u00E7\u00E3o e Radicia\u00E7\u00E3o",
  "Express\u00F5es Num\u00E9ricas",
];

function normalize(value) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[º°]/g, "o")
    .toLowerCase()
    .trim();
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function safeFileName(value) {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function waitForHydration(page) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(WAIT_AFTER_LOAD_MS);
}

async function clickVisibleButtonByText(page, expectedText) {
  const ok = await page.evaluate((text) => {
    const normalizeLocal = (value) =>
      (value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[º°]/g, "o")
        .toLowerCase()
        .trim();

    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };

    const target = normalizeLocal(text);
    const button = Array.from(document.querySelectorAll("button")).find(
      (element) => isVisible(element) && normalizeLocal(element.textContent) === target,
    );

    if (!button) return false;
    button.click();
    return true;
  }, expectedText);

  if (!ok) {
    throw new Error(`Botao visivel nao encontrado: ${expectedText}`);
  }
}

async function clickVisibleButtonContaining(page, expectedText) {
  const ok = await page.evaluate((text) => {
    const normalizeLocal = (value) =>
      (value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[º°]/g, "o")
        .toLowerCase()
        .trim();

    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };

    const target = normalizeLocal(text);
    const button = Array.from(document.querySelectorAll("button")).find(
      (element) => isVisible(element) && normalizeLocal(element.textContent).includes(target),
    );

    if (!button) return false;
    button.click();
    return true;
  }, expectedText);

  if (!ok) {
    throw new Error(`Botao visivel nao encontrado: ${expectedText}`);
  }
}

async function clickVisibleButtonContainingOptional(page, expectedText) {
  const ok = await page.evaluate((text) => {
    const normalizeLocal = (value) =>
      (value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[º°]/g, "o")
        .toLowerCase()
        .trim();

    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };

    const target = normalizeLocal(text);
    const button = Array.from(document.querySelectorAll("button")).find(
      (element) => isVisible(element) && normalizeLocal(element.textContent).includes(target),
    );

    if (!button) return false;
    button.click();
    return true;
  }, expectedText);

  return ok;
}

async function addCategoryBlock(page, categoryName) {
  await clickVisibleButtonContaining(page, "Adicionar exercicios");
  await page.waitForTimeout(500);

  const ok = await page.evaluate((categoryNameArg) => {
    const normalizeLocal = (value) =>
      (value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[º°]/g, "o")
        .toLowerCase()
        .trim();

    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };

    const target = normalizeLocal(categoryNameArg);
    const cardButton = Array.from(document.querySelectorAll("button")).find((element) => {
      const text = normalizeLocal(element.textContent);
      return (
        isVisible(element) &&
        text.includes(target) &&
        text.includes("criar bloco desta categoria")
      );
    });

    if (!cardButton) return false;
    cardButton.click();
    return true;
  }, categoryName);

  if (!ok) {
    throw new Error(`Categoria nao encontrada no modal: ${categoryName}`);
  }

  await page.waitForTimeout(800);
}

async function setRepeatHeader(page, enabled) {
  await clickVisibleButtonContaining(page, "Configuracoes");
  await page.waitForTimeout(350);
  await clickVisibleButtonContaining(page, "Opcoes");
  await page.waitForTimeout(350);

  const ok = await page.evaluate((enabledArg) => {
    const normalizeLocal = (value) =>
      (value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[º°]/g, "o")
        .toLowerCase()
        .trim();

    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };

    const rows = Array.from(document.querySelectorAll("label, div")).filter(
      (element) => isVisible(element) && normalizeLocal(element.textContent).includes("repetir cabecalho"),
    );

    const row = rows.find((element) =>
      element.querySelector('button[role="switch"], button, input[type="checkbox"]'),
    );
    if (!row) return false;

    const toggle =
      row.querySelector('button[role="switch"]') ||
      row.querySelector("button") ||
      row.querySelector('input[type="checkbox"]');

    if (!toggle) return false;

    if (toggle instanceof HTMLInputElement) {
      if (toggle.checked !== enabledArg) {
        toggle.click();
      }
      return true;
    }

    const pressed = toggle.getAttribute("aria-pressed");
    const checked = toggle.getAttribute("aria-checked");
    const state = pressed === "true" || checked === "true";
    if (state !== enabledArg) {
      toggle.click();
    }
    return true;
  }, enabled);

  if (!ok) {
    throw new Error("Nao foi possivel localizar o toggle 'Repetir cabecalho'.");
  }

  await page.waitForTimeout(450);
  await clickVisibleButtonContainingOptional(page, "Confirmar");
  await page.waitForTimeout(450);
  await clickVisibleButtonContainingOptional(page, "Confirmar");
  await page.waitForTimeout(450);
  await clickVisibleButtonContainingOptional(page, "Voltar aos exercicios");
  await page.waitForTimeout(350);
}

async function openPreview(page) {
  try {
    await clickVisibleButtonByText(page, "Pre-visualizacao");
  } catch {
    await clickVisibleButtonContaining(page, "Preview");
  }
  await page.waitForTimeout(2500);
}

async function readPreviewState(page) {
  return await page.evaluate(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };

    const texts = Array.from(document.querySelectorAll("*"))
      .filter((node) => node instanceof HTMLElement && visible(node))
      .map((node) => (node.textContent || "").trim())
      .filter(Boolean);

    const pageCounter = texts.find((text) => /^Pagina \d+ de \d+$/u.test(text)) || null;
    const topBadge =
      texts.find((text) => /^\d+ pagina(?:s)?$/u.test(text) && !text.includes("Pagina")) || null;

    return {
      pageCounter,
      topBadge,
      previewTextSample: texts.slice(0, 20),
    };
  });
}

async function getCurrentPreviewPageText(page) {
  return await page.evaluate(() => {
    const containers = Array.from(document.querySelectorAll(".preview-container"));
    const active = containers.find((element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    }) || containers[0];
    if (!active) return "";
    return (active.innerText || active.textContent || "").trim();
  });
}

async function goToNextPreviewPage(page) {
  const ok = await page.evaluate(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };

    const normalizeLocal = (value) =>
      (value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[º°]/g, "o")
        .toLowerCase()
        .trim();

    const buttons = Array.from(document.querySelectorAll("button")).filter(
      (element) => visible(element) && !element.disabled && normalizeLocal(element.textContent) === "",
    );
    const pagerButtons = buttons.filter((button) => {
      const rect = button.getBoundingClientRect();
      return rect.y > window.innerHeight - 180;
    });
    const target = pagerButtons[pagerButtons.length - 1];
    if (!target) return false;
    target.click();
    return true;
  });

  if (!ok) {
    throw new Error("Botao de proxima pagina nao encontrado no preview.");
  }

  await page.waitForTimeout(500);
}

async function openBlockDetail(page, blockIndex) {
  const cards = page.locator('[id^="sheet-block-card-"]');
  await cards.nth(blockIndex).scrollIntoViewIfNeeded();
  await cards.nth(blockIndex).click({ force: true });

  await page.waitForFunction(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };

    const normalizeLocal = (value) =>
      (value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[º°]/g, "o")
        .toLowerCase()
        .trim();

    return Array.from(document.querySelectorAll('input[type="range"]')).some((input) => {
      if (!visible(input)) return false;
      let parent = input.parentElement;
      for (let depth = 0; parent && depth < 10; depth += 1, parent = parent.parentElement) {
        const text = normalizeLocal(parent.textContent);
        if (text.includes("quantidade") && text.includes("confirmar")) {
          return true;
        }
      }
      return false;
    });
  }, { timeout: 5000 });
}

async function setBlockQuantity(page, blockIndex, quantity) {
  await openBlockDetail(page, blockIndex);

  await page.evaluate((value) => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };

    const normalizeLocal = (value) =>
      (value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[º°]/g, "o")
        .toLowerCase()
        .trim();

    const range = Array.from(document.querySelectorAll('input[type="range"]')).find((input) => {
      if (!visible(input)) return false;
      let parent = input.parentElement;
      for (let depth = 0; parent && depth < 10; depth += 1, parent = parent.parentElement) {
        const text = normalizeLocal(parent.textContent);
        if (text.includes("quantidade") && text.includes("confirmar")) {
          return true;
        }
      }
      return false;
    });

    if (!range) {
      throw new Error("Nao foi possivel localizar o slider de quantidade do bloco.");
    }

    range.value = String(value);
    range.dispatchEvent(new Event("input", { bubbles: true }));
    range.dispatchEvent(new Event("change", { bubbles: true }));
  }, quantity);

  await page.waitForTimeout(150);

  const confirmClicked = await page.evaluate(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };

    const normalizeLocal = (value) =>
      (value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[º°]/g, "o")
        .toLowerCase()
        .trim();

    const root = Array.from(document.querySelectorAll("div")).find((element) => {
      if (!visible(element)) return false;
      const text = normalizeLocal(element.textContent);
      return text.includes("quantidade") && text.includes("confirmar");
    });

    if (!root) return false;

    const btn = Array.from(root.querySelectorAll("button")).find(
      (button) => visible(button) && normalizeLocal(button.textContent).includes("confirmar"),
    );
    if (!btn) return false;
    btn.click();
    return true;
  });

  if (!confirmClicked) {
    throw new Error("Nao foi possivel confirmar as alteracoes do bloco.");
  }

  await page.waitForTimeout(500);
}

async function ensureCategoriesForty(page) {
  const currentCards = await page.locator('[id^="sheet-block-card-"]').count();
  const missing = [];

  for (const name of CATEGORY_NAMES) {
    const exists = await page.evaluate((categoryNameArg) => {
      const normalizeLocal = (value) =>
        (value || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[º°]/g, "o")
          .toLowerCase()
          .trim();

      const target = normalizeLocal(categoryNameArg);
      return Array.from(document.querySelectorAll('[id^="sheet-block-card-"]')).some((element) =>
        normalizeLocal(element.textContent).includes(target),
      );
    }, name);

    if (!exists) {
      missing.push(name);
    }
  }

  for (const name of missing) {
    await addCategoryBlock(page, name);
  }

  const totalCards = await page.locator('[id^="sheet-block-card-"]').count();
  for (let index = 0; index < totalCards; index += 1) {
    await setBlockQuantity(page, index, 40);
  }

  return { currentCards, totalCards, missing };
}

async function capturePreviewPages(page, scenarioDir) {
  await openPreview(page);
  const state = await readPreviewState(page);

  const match =
    state.pageCounter?.match(/Pagina \d+ de (\d+)/u) ||
    state.topBadge?.match(/(\d+) pagina/u);
  const pageCount = match ? Number(match[1]) : 0;

  const pages = [];
  for (let pageNumber = 1; pageNumber <= Math.max(1, pageCount); pageNumber += 1) {
    const text = await getCurrentPreviewPageText(page);
    const screenshotPath = path.join(
      scenarioDir,
      `preview-page-${String(pageNumber).padStart(2, "0")}.png`,
    );
    await page.screenshot({ path: screenshotPath, fullPage: true });

    pages.push({
      pageNumber,
      textLength: text.length,
      questionCount: (text.match(/\)\s/g) || []).length,
      hasWorksheetTitle: normalize(text).includes("folha de exercicios"),
      hasAnswerTitle: normalize(text).includes("gabarito"),
      startsBlank: text.length < 80,
      sample: text.slice(0, 220),
      screenshotPath,
    });

    if (pageNumber < pageCount) {
      await goToNextPreviewPage(page);
    }
  }

  return { pageCount, pages, state };
}

async function exportPreviewPdf(page, scenarioDir) {
  const popupPromise = page.context().waitForEvent("page", { timeout: 15000 });
  await page.getByRole("button", { name: /Gerar PDF/i }).click({ timeout: 15000 });
  const popup = await popupPromise;

  await popup.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
  await popup.waitForFunction(
    () => document.querySelectorAll(".print-page").length > 0,
    null,
    { timeout: 15000 },
  );

  const pdfPath = path.join(scenarioDir, "exported.pdf");
  await popup.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
  });

  const popupScreenshot = path.join(scenarioDir, "export-popup.png");
  await popup.screenshot({ path: popupScreenshot, fullPage: true }).catch(() => {});

  return { pdfPath, popupScreenshot };
}

async function runScenario(browser, { name, viewport, repeatHeader }) {
  const context = await browser.newContext(viewport);
  const page = await context.newPage();
  page.on("pageerror", (error) => console.error(`[${name}] PAGEERROR:`, error.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.error(`[${name}] CONSOLE_ERROR:`, msg.text());
    }
  });

  await waitForHydration(page);
  const scenarioDir = path.join(ARTIFACT_DIR, safeFileName(name));
  ensureDir(scenarioDir);

  const categories = await ensureCategoriesForty(page);
  const beforeConfig = await page.locator("body").innerText().catch(() => "");

  if (repeatHeader) {
    await setRepeatHeader(page, true);
  }

  const preview = await capturePreviewPages(page, scenarioDir);
  const pdf = await exportPreviewPdf(page, scenarioDir).catch((error) => ({
    error: error.message,
    pdfPath: null,
    popupScreenshot: null,
  }));

  const result = {
    name,
    viewport,
    repeatHeader,
    categories,
    beforeConfigSample: beforeConfig.slice(0, 500),
    preview,
    pdf,
    visibleButtons: await page
      .locator("button:visible")
      .evaluateAll((btns) => btns.map((b) => (b.innerText || b.textContent || "").trim()).filter(Boolean))
      .catch(() => []),
  };

  await page.screenshot({ path: path.join(scenarioDir, "final-state.png"), fullPage: true }).catch(() => {});
  await context.close();
  return result;
}

async function main() {
  ensureDir(ARTIFACT_DIR);

  const browser = await chromium.launch({ headless: true });
  const scenarios = [
    {
      name: "desktop-no-header",
      viewport: { width: 1440, height: 1100 },
      repeatHeader: false,
    },
    {
      name: "desktop-with-header",
      viewport: { width: 1440, height: 1100 },
      repeatHeader: true,
    },
    {
      name: "mobile-no-header",
      viewport: { ...devices["Pixel 7"] },
      repeatHeader: false,
    },
    {
      name: "mobile-with-header",
      viewport: { ...devices["Pixel 7"] },
      repeatHeader: true,
    },
  ];

  const report = {
    baseUrl: BASE_URL,
    generatedAt: new Date().toISOString(),
    scenarios: [],
  };

  for (const scenario of scenarios) {
    const result = await runScenario(browser, scenario);
    report.scenarios.push(result);
  }

  const reportPath = path.join(ARTIFACT_DIR, "summary.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log(JSON.stringify({ reportPath, report }, null, 2));

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
