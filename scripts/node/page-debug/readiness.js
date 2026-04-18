function assertReadyNavigation({ requestedUrl, finalUrl, waitForUrl }) {
  const final = new URL(finalUrl);
  if (final.pathname === '/sign-in') {
    throw new Error(`页面回跳到 /sign-in，认证态未生效：${finalUrl}`);
  }

  if (waitForUrl && finalUrl !== waitForUrl) {
    throw new Error(`最终 URL 不匹配 wait-for-url：expected=${waitForUrl} actual=${finalUrl}`);
  }

  return {
    finalUrl,
    readyState: waitForUrl ? 'ready_with_url' : 'ready',
  };
}

async function waitForPageReady({ page, requestedUrl, waitForUrl, waitForSelector, timeout }) {
  await page.waitForLoadState('domcontentloaded', { timeout });
  await page.waitForFunction(() => document.readyState === 'complete', { timeout });
  await page.waitForFunction(() => !document.body?.innerText?.includes('正在恢复会话...'), {
    timeout,
  });

  const baseResult = assertReadyNavigation({
    requestedUrl,
    finalUrl: page.url(),
    waitForUrl,
  });

  if (waitForSelector) {
    await page.locator(waitForSelector).first().waitFor({
      state: 'visible',
      timeout,
    });

    return {
      finalUrl: page.url(),
      readyState: 'ready_with_selector',
    };
  }

  return baseResult;
}

module.exports = {
  assertReadyNavigation,
  waitForPageReady,
};
