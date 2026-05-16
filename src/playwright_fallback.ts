import { chromium, type Page } from "playwright";
import type { LicenseLookupInput } from "./api_probe";

const FALLBACK_URLS = [
  "https://info-car.pl/new/prawo-jazdy",
  "https://info-car.pl/prawo-jazdy",
];

export type PlaywrightFallbackResult = {
  ok: boolean;
  source: "playwright";
  url?: string;
  detectedStatuses: string[];
  rawSnippet?: string;
  error?: string;
};

const compactText = (value: string): string => value.replace(/\s+/g, " ").trim();

const detectStatuses = (text: string): string[] => {
  const statuses = new Set<string>();
  const normalized = compactText(text);

  if (/wniosek\s+przyj[ęe]ty/i.test(normalized)) {
    statuses.add("Wniosek przyjęty");
  }

  if (/dokument\s+zam[oó]wiony/i.test(normalized)) {
    statuses.add("Dokument zamówiony");
  }

  if (/dokument\s+gotowy\s+do\s+odbioru/i.test(normalized)) {
    statuses.add("Dokument gotowy do odbioru");
  }

  if (/dokument\s+wydany/i.test(normalized)) {
    statuses.add("Dokument wydany");
  }

  return Array.from(statuses);
};

const fillFirstVisible = async (page: Page, selectors: string[], value: string): Promise<boolean> => {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (!(await locator.count())) {
      continue;
    }

    if (!(await locator.isVisible().catch(() => false))) {
      continue;
    }

    await locator.fill(value);
    return true;
  }

  return false;
};

const clickFirstVisible = async (page: Page, selectors: string[]): Promise<boolean> => {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (!(await locator.count())) {
      continue;
    }

    if (!(await locator.isVisible().catch(() => false))) {
      continue;
    }

    await locator.click();
    return true;
  }

  return false;
};

export const runPlaywrightFallback = async (
  input: LicenseLookupInput,
  timeoutMs: number = 30000,
): Promise<PlaywrightFallbackResult> => {
  const identifier = input.pesel || input.documentNumber || input.applicationNumber || "";
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let page: Page | undefined;

  try {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();

    for (const url of FALLBACK_URLS) {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });

      await fillFirstVisible(page, [
        'input[name*="imie" i]',
        'input[id*="imie" i]',
        'input[placeholder*="imię" i]',
        'input[placeholder*="imie" i]',
        'input[aria-label*="imię" i]',
        'input[aria-label*="imie" i]',
      ], input.firstName);

      await fillFirstVisible(page, [
        'input[name*="nazw" i]',
        'input[id*="nazw" i]',
        'input[placeholder*="nazwisko" i]',
        'input[aria-label*="nazwisko" i]',
      ], input.lastName);

      await fillFirstVisible(page, [
        'input[name*="pesel" i]',
        'input[id*="pesel" i]',
        'input[name*="identifier" i]',
        'input[id*="identifier" i]',
        'input[name*="numer" i]',
        'input[id*="numer" i]',
        'input[placeholder*="pesel" i]',
        'input[placeholder*="numer" i]',
        'input[aria-label*="pesel" i]',
        'input[aria-label*="numer" i]',
      ], identifier);

      await clickFirstVisible(page, [
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("Sprawdź")',
        'button:has-text("Sprawdz")',
        'button:has-text("Szukaj")',
      ]);

      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => undefined);
      await page.waitForTimeout(1500);

      const bodyText = await page.locator("body").innerText();
      const detectedStatuses = detectStatuses(bodyText);

      if (detectedStatuses.length > 0) {
        return {
          ok: true,
          source: "playwright",
          url,
          detectedStatuses,
          rawSnippet: compactText(bodyText).slice(0, 500),
        };
      }
    }

    const finalText = await page.locator("body").innerText().catch(() => "");

    return {
      ok: false,
      source: "playwright",
      detectedStatuses: [],
      rawSnippet: compactText(finalText).slice(0, 500),
      error: "Не удалось получить статус через browser fallback. Возможно, нужна авторизация, CAPTCHA или изменилась разметка формы.",
    };
  } catch (error) {
    return {
      ok: false,
      source: "playwright",
      detectedStatuses: [],
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (page) {
      await page.close().catch(() => undefined);
    }
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
};
