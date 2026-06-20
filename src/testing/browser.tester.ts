import type { BrowserBinding, PageInstance } from "../env";

export class BrowserTester {
  constructor(private readonly browser?: BrowserBinding) {}

  async runTest(url: string, _steps: string[] = []): Promise<{ success: boolean; screenshot?: string }> {
    if (!this.browser) return { success: false, screenshot: undefined };

    try {
      const browser = await this.browser.launch();
      const page = await browser.newPage();

      await page.goto(url, { waitUntil: "networkidle0" });

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const screenshot = await page.screenshot();
      await browser.close();

      return { success: true, screenshot: Buffer.from(screenshot).toString("base64") };
    } catch (err) {
      return { success: false };
    }
  }
}