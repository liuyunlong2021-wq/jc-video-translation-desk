import { BrowserWindow } from 'electron'

const PINTEREST_HOSTS = new Set(['www.pinterest.com', 'jp.pinterest.com', 'i.pinimg.com'])
let pinterestWindow: BrowserWindow | null = null
let closeTimer: ReturnType<typeof setTimeout> | undefined

function allowedUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && PINTEREST_HOSTS.has(url.hostname)
  } catch {
    return false
  }
}

function browserWindow() {
  clearTimeout(closeTimer)
  if (pinterestWindow && !pinterestWindow.isDestroyed()) return pinterestWindow
  pinterestWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    show: true,
    title: 'Pinterest 参考图搜索',
    webPreferences: {
      partition: 'persist:pinterest-reference',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  pinterestWindow.webContents.setZoomFactor(1)
  pinterestWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  pinterestWindow.webContents.on('will-navigate', (event, url) => {
    if (!allowedUrl(url)) event.preventDefault()
  })
  pinterestWindow.on('closed', () => {
    pinterestWindow = null
  })
  return pinterestWindow
}

function closeAfterBatch() {
  clearTimeout(closeTimer)
  closeTimer = setTimeout(() => {
    if (pinterestWindow && !pinterestWindow.isDestroyed()) pinterestWindow.close()
  }, 500)
}

async function waitForValue<T>(
  window: BrowserWindow,
  script: string,
  timeoutMessage: string,
): Promise<T> {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (window.isDestroyed()) throw new Error('已取消 Pinterest 搜索')
    const value = await window.webContents.executeJavaScript(script, true).catch(() => null)
    if (value) return value as T
    await new Promise((resolve) => setTimeout(resolve, 700))
  }
  throw new Error(timeoutMessage)
}

export async function capturePinterestReference(
  searchQuery: string,
  rejectedPinIds: string[] = [],
) {
  const query = searchQuery.trim()
  if (!query || query.length > 160) throw new Error('资产搜索词无效')
  const window = browserWindow()
  window.show()
  window.focus()
  const searchUrl = `https://jp.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`
  await window.loadURL(searchUrl)
  const rejected = JSON.stringify(rejectedPinIds)
  const pin = await waitForValue<{ id: string; url: string; sourceUrl: string }>(
    window,
    `(() => {
      const rejected = new Set(${rejected});
      for (const anchor of document.querySelectorAll('a[href*="/pin/"]')) {
        const match = anchor.getAttribute('href')?.match(/\\/pin\\/(\\d+)/);
        const image = anchor.querySelector('img');
        const rect = image?.getBoundingClientRect();
        if (match && !rejected.has(match[1]) && image?.complete && image.naturalWidth > 0 && rect && rect.width >= 120 && rect.height >= 120)
          return { id: match[1], url: new URL(anchor.getAttribute('href'), location.origin).href, sourceUrl: image.currentSrc || image.src };
      }
      return null;
    })()`,
    'Pinterest 未加载出可用参考图；如窗口要求登录，请完成登录后重试',
  )
  if (!allowedUrl(pin.url)) throw new Error('Pinterest 返回了无效的 Pin 地址')
  await window.loadURL(pin.url)
  const sourceUrl =
    (await window.webContents.executeJavaScript(
      `(() => {
      const preferred = [...document.querySelectorAll('[data-test-id="pin-closeup-image"] img, [data-test-id="visual-content-container"] img')];
      const images = preferred.length ? preferred : [...document.images];
      return document.querySelector('meta[property="og:image"]')?.content || images
        .filter(img => img.complete && img.naturalWidth > 0 && /^https:\\/\\/i\\.pinimg\\.com\\//.test(img.currentSrc || img.src))
        .sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight))[0]?.currentSrc || null;
    })()`, true).catch(() => null)) || pin.sourceUrl
  if (!allowedUrl(sourceUrl) || new URL(sourceUrl).hostname !== 'i.pinimg.com')
    throw new Error('Pinterest 主图地址无效')

  const captureWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  try {
    await captureWindow.loadURL(sourceUrl)
    const rect = await waitForValue<{ x: number; y: number; width: number; height: number }>(
      captureWindow,
      `(() => {
        const image = document.images[0];
        const rect = image?.getBoundingClientRect();
        if (!image?.complete || image.naturalWidth < 200 || image.naturalHeight < 200 || !rect || rect.width < 100 || rect.height < 100) return null;
        return { x: Math.max(0, rect.x), y: Math.max(0, rect.y), width: rect.width, height: rect.height };
      })()`,
      'Pinterest 主图无法截取',
    )
    const image = await captureWindow.webContents.capturePage({
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    })
    const png = image.toPNG()
    if (png.length < 1024 || image.getSize().width < 100 || image.getSize().height < 100)
      throw new Error('Pinterest 主图截图无效')
    closeAfterBatch()
    return { pinId: pin.id, sourcePageUrl: pin.url, sourceUrl, png }
  } finally {
    if (!captureWindow.isDestroyed()) captureWindow.destroy()
  }
}
