const { chromium } = require("playwright");

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3000/tools/gerador-atividades";
const WAIT_AFTER_LOAD_MS = 8000;

function normalize(value) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
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
        .toLowerCase()
        .trim();

    const target = normalizeLocal(text);
    const button = Array.from(document.querySelectorAll("button")).find(
      (element) =>
        !!element.offsetParent && normalizeLocal(element.textContent) === target,
    );

    if (!button) return false;
    button.click();
    return true;
  }, expectedText);

  if (!ok) {
    throw new Error(`Botão visível não encontrado: ${expectedText}`);
  }
}

async function clickVisibleButtonContaining(page, expectedText) {
  const ok = await page.evaluate((text) => {
    const normalizeLocal = (value) =>
      (value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();

    const target = normalizeLocal(text);
    const button = Array.from(document.querySelectorAll("button")).find(
      (element) =>
        !!element.offsetParent && normalizeLocal(element.textContent).includes(target),
    );

    if (!button) return false;
    button.click();
    return true;
  }, expectedText);

  if (!ok) {
    throw new Error(`Botão visível não encontrado: ${expectedText}`);
  }
}

async function addCategoryBlock(page, categoryName) {
  await clickVisibleButtonContaining(page, "Adicionar exercicios");
  await page.waitForTimeout(400);

  const ok = await page.evaluate((categoryNameArg) => {
    const normalizeLocal = (value) =>
      (value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();

    const target = normalizeLocal(categoryNameArg);
    const cardButton = Array.from(document.querySelectorAll("button")).find((element) => {
      const text = normalizeLocal(element.textContent);
      return (
        !!element.offsetParent &&
        text.includes(target) &&
        text.includes("criar bloco desta categoria")
      );
    });

    if (!cardButton) return false;
    cardButton.click();
    return true;
  }, categoryName);

  if (!ok) {
    throw new Error(`Categoria não encontrada no modal: ${categoryName}`);
  }

  await page.waitForTimeout(450);
}

async function setRepeatHeader(page, enabled) {
  const ok = await page.evaluate((enabledArg) => {
    const normalizeLocal = (value) =>
      (value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();

    const rows = Array.from(document.querySelectorAll("label, div")).filter(
      (element) =>
        !!element.offsetParent &&
        normalizeLocal(element.textContent).includes("repetir cabecalho"),
    );

    const row = rows.find((element) => element.querySelector('button[role="switch"], button, input[type="checkbox"]'));
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
    throw new Error("Não foi possível localizar o toggle 'Repetir cabeçalho'.");
  }

  await page.waitForTimeout(500);
}

async function openPreview(page) {
  await clickVisibleButtonByText(page, "Preview");
  await page.waitForTimeout(2500);
}

async function readPreviewState(page) {
  return await page.evaluate(() => {
    const texts = Array.from(document.querySelectorAll("*"))
      .filter((node) => node instanceof HTMLElement && !!node.offsetParent)
      .map((node) => (node.textContent || "").trim())
      .filter(Boolean);

    const pageCounter = texts.find((text) => /^Página \d+ de \d+$/u.test(text)) || null;
    const topBadge =
      texts.find((text) => /^\d+ página(?:s)?$/u.test(text) && !text.includes("Página")) || null;

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
    const active = containers.find((element) => !!element.offsetParent) || containers[0];
    if (!active) return "";
    return (active.innerText || active.textContent || "").trim();
  });
}

async function goToNextPreviewPage(page) {
  const ok = await page.evaluate(() => {
    const normalizeLocal = (value) =>
      (value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
    const buttons = Array.from(document.querySelectorAll("button")).filter((element) => {
      if (!element.offsetParent) return false;
      return !element.disabled && normalizeLocal(element.textContent) === "";
    });
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
    throw new Error("Botão de próxima página não encontrado no preview.");
  }

  await page.waitForTimeout(500);
}

async function buildManyPagesScenario(page) {
  for (let index = 0; index < 12; index += 1) {
    await addCategoryBlock(page, "Aritmética");
  }

  await openPreview(page);
  const state = await readPreviewState(page);

  const match =
    state.pageCounter?.match(/Página \d+ de (\d+)/u) ||
    state.topBadge?.match(/(\d+) página/u);
  const pageCount = match ? Number(match[1]) : 0;

  const pages = [];
  for (let pageNumber = 1; pageNumber <= Math.max(1, pageCount); pageNumber += 1) {
    const text = await getCurrentPreviewPageText(page);
    pages.push({
      pageNumber,
      textLength: text.length,
      questionCount: (text.match(/\)\s/g) || []).length,
      hasWorksheetTitle: normalize(text).includes("folha de exercicios"),
      hasAnswerTitle: normalize(text).includes("gabarito"),
      startsBlank: text.length < 80,
      sample: text.slice(0, 220),
    });

    if (pageNumber < pageCount) {
      await goToNextPreviewPage(page);
    }
  }

  return { pageCount, pages, state };
}

async function buildRepeatHeaderScenario(page) {
  for (let index = 0; index < 12; index += 1) {
    await addCategoryBlock(page, "Aritmética");
  }

  await clickVisibleButtonByText(page, "Configurações");
  await page.waitForTimeout(500);
  await clickVisibleButtonContaining(page, "Opcoes");
  await page.waitForTimeout(500);
  await setRepeatHeader(page, true);
  await clickVisibleButtonContaining(page, "Confirmar");
  await page.waitForTimeout(500);
  await clickVisibleButtonContaining(page, "Voltar aos exercicios");
  await page.waitForTimeout(500);

  await openPreview(page);
  const state = await readPreviewState(page);
  const pageMatch =
    state.pageCounter?.match(/Página \d+ de (\d+)/u) ||
    state.topBadge?.match(/(\d+) página/u);
  const pageCount = pageMatch ? Number(pageMatch[1]) : 0;

  const firstPageText = await getCurrentPreviewPageText(page);
  let secondPageText = "";
  if (pageCount > 1) {
    await goToNextPreviewPage(page);
    secondPageText = await getCurrentPreviewPageText(page);
  }

  return {
    pageCount,
    firstHasHeader: normalize(firstPageText).includes("folha de exercicios"),
    secondHasHeader: normalize(secondPageText).includes("folha de exercicios"),
    firstSample: firstPageText.slice(0, 220),
    secondSample: secondPageText.slice(0, 220),
  };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const manyPagesPage = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const repeatHeaderPage = await browser.newPage({ viewport: { width: 430, height: 932 } });

  manyPagesPage.on("pageerror", (error) => console.error("PAGEERROR many-pages:", error.message));
  repeatHeaderPage.on("pageerror", (error) =>
    console.error("PAGEERROR repeat-header:", error.message),
  );

  await waitForHydration(manyPagesPage);
  const manyPages = await buildManyPagesScenario(manyPagesPage);

  await waitForHydration(repeatHeaderPage);
  const repeatHeader = await buildRepeatHeaderScenario(repeatHeaderPage);

  console.log(
    JSON.stringify(
      {
        baseUrl: BASE_URL,
        generatedAt: new Date().toISOString(),
        manyPages,
        repeatHeader,
      },
      null,
      2,
    ),
  );

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
