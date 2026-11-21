import type { Page } from '@playwright/test';

export async function pasteShortcut(page: Page, modifier: string) {
  if (modifier === 'Meta') {
    await page.evaluate(() => {
      if (/Mac/.test(navigator.platform)) return;
      const paste = (event: KeyboardEvent) => {
        if (!event.metaKey || event.key.toLowerCase() !== 'v') return;
        window.removeEventListener('keydown', paste);
        if (!event.defaultPrevented) {
          document.activeElement?.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: new DataTransfer() }));
        }
      };
      window.addEventListener('keydown', paste);
    });
  }
  await page.keyboard.press(`${modifier}+v`);
}
