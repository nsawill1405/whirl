import type { Page } from '@playwright/test';

async function clipboardShortcut(page: Page, modifier: string, key: 'c' | 'v') {
  if (modifier === 'Meta') {
    await page.evaluate(key => {
      if (/Mac/.test(navigator.platform)) return;
      const paste = (event: KeyboardEvent) => {
        if (!event.metaKey || event.key.toLowerCase() !== key) return;
        window.removeEventListener('keydown', paste);
        if (!event.defaultPrevented) {
          document.activeElement?.dispatchEvent(new ClipboardEvent(key === 'c' ? 'copy' : 'paste', { bubbles: true, cancelable: true, clipboardData: new DataTransfer() }));
        }
      };
      window.addEventListener('keydown', paste);
    }, key);
  }
  await page.keyboard.press(`${modifier}+${key}`);
}

export const pasteShortcut = (page: Page, modifier: string) => clipboardShortcut(page, modifier, 'v');
export const copyShortcut = (page: Page, modifier: string) => clipboardShortcut(page, modifier, 'c');
