import { test, expect } from './fixtures';

for (const theme of ['light', 'dark']) {
  test(`mobile admin upload and approval in ${theme}`, async ({ page, library }) => {
    library.role = 'admin';
    library.failFirstUpload = true;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript((value) => localStorage.setItem('theme', value), theme);
    await page.goto('/admin/upload');
    await page.getByLabel('Choose PDF files').setInputFiles([
      { name: 'MCS_2025_Roleplay.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 fixture') },
      { name: 'Marketing_Reference.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 fixture') },
    ]);
    const cards = page.getByRole('article');
    await expect(cards).toHaveCount(2);
    await cards.first().getByLabel('Resource type').selectOption('reference');
    await expect(cards.first()).toContainText('appear in Reference once approved');
    await cards.first().getByText('More details').click();
    await cards.first().getByRole('combobox', { name: 'Event', exact: true }).selectOption('MCS');
    await cards.first().getByRole('combobox', { name: 'Event', exact: true }).selectOption('');
    await expect(cards.first().getByRole('combobox', { name: 'Event', exact: true })).toHaveValue('');
    await cards.first().getByLabel('Year', { exact: true }).fill('');
    if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/dark/); else await expect(page.locator('html')).not.toHaveClass(/dark/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `.next/cache/admin-upload-${theme}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Upload 2 files', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Uploaded 1 resource.' })).toBeVisible();
    await expect(cards).toHaveCount(1);
    await expect(page.getByText('This PDF exceeds the upload size limit.')).toBeVisible();
    await page.getByRole('button', { name: 'Retry 1 file', exact: true }).click();
    await expect(cards).toHaveCount(0);
    expect(library.uploadRequests).toBe(3);
    const clearedUpload = library.resources.find((resource) => resource.original_filename === 'MCS_2025_Roleplay.pdf');
    expect(clearedUpload).toMatchObject({ event_code: null, event_name: null, event_category: null, year: null, resource_type: 'reference' });
    await page.getByRole('link', { name: 'Open approval queue' }).click();
    await expect(page.getByRole('status')).toHaveText('Showing 3 of 3 pending resources.');
    const first = page.getByRole('article').first();
    await first.getByRole('button', { name: 'Review / edit' }).click();
    await first.getByLabel('Title', { exact: true }).fill('Reviewed reference guide');
    await first.getByLabel('Resource type').selectOption('reference');
    await first.getByRole('button', { name: 'Save details' }).click();
    await expect(first.getByRole('heading')).toHaveText('Reviewed reference guide');
    await first.getByRole('button', { name: 'Review / edit' }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `.next/cache/admin-approval-${theme}.png`, fullPage: true });
    await first.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Showing 2 of 2 pending resources.');
    await page.getByRole('checkbox', { name: 'Select all shown' }).check();
    await page.getByRole('button', { name: 'Approve selected', exact: true }).click();
    await expect(page.getByText('Nothing waiting for approval')).toBeVisible();
    await page.getByRole('button', { name: /^approved/i }).click();
    await expect(page.getByRole('status')).toHaveText('Showing 6 of 6 approved resources.');
    library.role = 'student';
    await page.goto('/reference');
    await expect(page.getByRole('link', { name: /Reviewed reference guide/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Marketing Reference/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Local campaign/ })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}



