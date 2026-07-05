import { test, expect } from '@playwright/test';

test.describe('App Launch', () => {
  test('loads the app and shows onboarding', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Veill|Quidec/i);
  });

  test('redirects to onboarding when not authenticated', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL(/onboarding/, { timeout: 10000 });
    expect(page.url()).toContain('/onboarding');
  });
});

test.describe('Privacy Policy Page', () => {
  test('navigates to privacy policy', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
    await expect(page.getByText('Last updated:')).toBeVisible();
  });

  test('contains encryption section', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { name: 'End-to-End Encryption' })).toBeVisible();
    await expect(page.getByText('AES-256-GCM').first()).toBeVisible();
  });

  test('contains GDPR rights section', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { name: /Your Rights/ })).toBeVisible();
  });

  test('has back button with correct aria-label', async ({ page }) => {
    await page.goto('/privacy');
    const backBtn = page.getByRole('button', { name: 'Go back' });
    await expect(backBtn).toBeAttached();
  });
});

test.describe('Terms of Service Page', () => {
  test('navigates to terms of service', async ({ page }) => {
    await page.goto('/terms');
    await expect(page.getByRole('heading', { name: 'Terms of Service' })).toBeVisible();
    await expect(page.getByText('Last updated:')).toBeVisible();
  });

  test('contains acceptable use section', async ({ page }) => {
    await page.goto('/terms');
    await expect(page.getByRole('heading', { name: 'Acceptable Use' })).toBeVisible();
  });

  test('has back button with correct aria-label', async ({ page }) => {
    await page.goto('/terms');
    const backBtn = page.getByRole('button', { name: 'Go back' });
    await expect(backBtn).toBeAttached();
  });
});
