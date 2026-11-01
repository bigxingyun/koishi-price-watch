import type { PageLike } from './browser'

/**
 * 二维码提取（不引入二维码库）。
 *
 * 踩过的两个坑：
 * 1. **靠 class 名找会漏**：拼多多登录页有「扫一扫」字样，但二维码元素的 class/id 里
 *    没有任何 qr/code 字样（实测 2026-10）。
 * 2. **直接读 canvas 会被跨域污染**：京东的二维码是 `qr.m.jd.com` 的图片，
 *    画到 canvas 后 `getImageData` 直接抛 SecurityError。
 *
 * 所以做法是：
 *   a) 在页面里按「尺寸/比例/类名线索」找候选元素，只取 boundingRect（不需要读像素）
 *   b) 用 Playwright 对每个候选**截图**（合成器截图不受跨域限制）
 *   c) 把这张 PNG 以 dataURL 送回页面，页面里用 `Image` 解码后画到干净的 canvas 上读像素
 *      （data: URL 同源，可读）
 *   d) 用左上角定位图案反推模块尺寸，验证模块数，产出矩阵
 *
 * 这样既不需要二维码解码库，也不受跨域影响，还能顺便拿到矩阵在控制台打印。
 */

export interface QrCapture {
  /** 裁剪放大后的二维码 PNG */
  image: Buffer
  /** true = 黑模块 */
  matrix: boolean[][]
  modules: number
  size: { width: number; height: number }
}

/** 第一步：找候选矩形（只读几何信息，不读像素） */
const FIND_CANDIDATES = `(() => {
  const rects = []
  const seen = new Set()
  const push = (el) => {
    if (seen.has(el)) return
    seen.add(el)
    const r = el.getBoundingClientRect()
    if (r.width < 56 || r.height < 56) return
    if (r.width > 900 || r.height > 900) return
    const ratio = r.width / r.height
    if (ratio < 0.8 || ratio > 1.25) return
    if (r.right < 0 || r.bottom < 0) return
    rects.push({
      x: Math.max(0, Math.round(r.left)),
      y: Math.max(0, Math.round(r.top)),
      width: Math.round(r.width),
      height: Math.round(r.height),
      hint: ((el.className || '') + ' ' + (el.id || '') + ' ' + (el.getAttribute && el.getAttribute('src') || '')).slice(0, 80),
    })
  }
  for (const el of document.querySelectorAll('canvas, img, iframe')) push(el)
  for (const el of document.querySelectorAll('div, span, section, p')) {
    const bg = getComputedStyle(el).backgroundImage || ''
    if (bg && bg !== 'none' && bg.indexOf('url(') >= 0) push(el)
  }
  // 类名/属性里有 qr 线索的排前面
  rects.sort((a, b) => {
    const score = (s) => /qr|code|scan|erweima/i.test(s.hint) ? 1 : 0
    return score(b.hint) - score(a.hint)
  })
  return rects.slice(0, 8)
})()`

/**
 * 切到「扫码登录」标签页。
 *
 * 拼多多登录页默认是「手机登录」，二维码在点过「扫码登录」之后才渲染出来
 * （实测：初始页面 canvas/img/iframe 数量为 0，只有 div.qrcode-login 这个 tab）。
 */
const ACTIVATE_SCRIPT = `(() => {
  const labels = ['扫码登录', '扫码', '扫一扫', '二维码登录', '二维码']
  const nodes = Array.from(document.querySelectorAll('div, span, a, button, li, p'))
  for (const label of labels) {
    const el = nodes.find((e) => {
      const text = (e.textContent || '').trim()
      if (text !== label) return false
      const r = e.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    })
    if (el) {
      try { el.click() } catch (e) { continue }
      return label
    }
  }
  return null
})()`

/** 尝试切换到扫码 tab，返回被点击的文案 */
export async function activateQrTab(page: PageLike): Promise<string | null> {
  try {
    return await page.evaluate<string | null>(ACTIVATE_SCRIPT)
  } catch {
    return null
  }
}
/** 第二步：在页面里解码 PNG → 矩阵（data: URL，不受跨域限制） */
function analyseScript(dataUrl: string, scale = 3): string {
  return `(async () => {
    const SCALE = ${scale}
    const img = new Image()
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = reject
      img.src = ${JSON.stringify(dataUrl)}
    })
    const w = img.naturalWidth
    const h = img.naturalHeight
    if (!w || !h) return null

    const src = document.createElement('canvas')
    src.width = w
    src.height = h
    const sctx = src.getContext('2d', { willReadFrequently: true })
    sctx.drawImage(img, 0, 0)
    let data
    try { data = sctx.getImageData(0, 0, w, h).data } catch (e) { return null }

    let minX = w, minY = h, maxX = -1, maxY = -1, count = 0
    const dark = new Uint8Array(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
        const isDark = lum < 110
        dark[y * w + x] = isDark ? 1 : 0
        if (isDark) {
          count++
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
    if (maxX < 0) return null

    const bw = maxX - minX + 1
    const bh = maxY - minY + 1
    if (bw < 50 || bh < 50) return null
    const boxRatio = bw / bh
    if (boxRatio < 0.85 || boxRatio > 1.18) return null
    const fill = count / (bw * bh)
    if (fill < 0.15 || fill > 0.7) return null

    // 模块数不能靠「首行黑run/7」推 —— 实测京东那张会算出 50（不是合法 QR 版本）。
    // 改成枚举所有合法版本（21 + 4k），用三个定位角的 7×7 图案验证哪个对。
    const sampleAt = (n) => {
      const ms = bw / n
      if (ms < 1.5) return null
      const grid = []
      for (let r = 0; r < n; r++) {
        const row = []
        for (let c = 0; c < n; c++) {
          const sx = Math.min(w - 1, Math.round(minX + (c + 0.5) * ms))
          const sy = Math.min(h - 1, Math.round(minY + (r + 0.5) * ms))
          row.push(dark[sy * w + sx] === 1)
        }
        grid.push(row)
      }
      return { grid, ms }
    }

    // QR 定位图案：7×7，外框黑、次外圈白、中心 3×3 黑
    const finderOk = (grid, r0, c0) => {
      const at = (r, c) => !!(grid[r0 + r] && grid[r0 + r][c0 + c])
      for (let i = 0; i < 7; i++) {
        if (!at(0, i) || !at(6, i) || !at(i, 0) || !at(i, 6)) return false
      }
      for (let i = 1; i <= 5; i++) {
        if (at(1, i) || at(5, i) || at(i, 1) || at(i, 5)) return false
      }
      for (let r = 2; r <= 4; r++) {
        for (let c = 2; c <= 4; c++) if (!at(r, c)) return false
      }
      return true
    }

    let modules = 0
    let matrix = null
    let moduleSize = 0
    for (let n = 21; n <= 177; n += 4) {
      const sampled = sampleAt(n)
      if (!sampled) break
      const g = sampled.grid
      if (!finderOk(g, 0, 0)) continue
      if (!finderOk(g, 0, n - 7)) continue
      if (!finderOk(g, n - 7, 0)) continue
      modules = n
      matrix = g
      moduleSize = sampled.ms
      break
    }
    if (!matrix) return null

    // 放大裁剪（最近邻，边缘锐利）
    const pad = Math.max(4, Math.round(moduleSize))
    const out = document.createElement('canvas')
    out.width = (bw + pad * 2) * SCALE
    out.height = (bh + pad * 2) * SCALE
    const octx = out.getContext('2d')
    octx.imageSmoothingEnabled = false
    octx.fillStyle = '#ffffff'
    octx.fillRect(0, 0, out.width, out.height)
    octx.drawImage(src, minX, minY, bw, bh, pad * SCALE, pad * SCALE, bw * SCALE, bh * SCALE)

    return {
      dataUrl: out.toDataURL('image/png'),
      matrix,
      modules,
      size: { width: bw, height: bh },
    }
  })()`
}

export interface DetectResult {
  dataUrl: string
  matrix: boolean[][]
  modules: number
  size: { width: number; height: number }
}

/**
 * 在页面里找二维码并提取。
 * 找到返回图片 + 矩阵；找不到返回 null（由调用方决定兜底策略）。
 */
export async function captureQr(page: PageLike): Promise<QrCapture | null> {
  // 二维码是异步渲染的（淘宝 canvas 尤其慢），必须重试，不能一次定生死
  for (let attempt = 0; attempt < 3; attempt++) {
    const found = await captureOnce(page)
    if (found) return found
    await new Promise((resolve) => setTimeout(resolve, 1200))
  }

  // 还是没找到 → 可能默认停在「手机登录」tab（拼多多），切过去再重试
  const clicked = await activateQrTab(page)
  if (!clicked) return null
  for (let attempt = 0; attempt < 3; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1200))
    const found = await captureOnce(page)
    if (found) return found
  }
  return null
}

async function captureOnce(page: PageLike): Promise<QrCapture | null> {
  let rects: Array<{ x: number; y: number; width: number; height: number; hint: string }> = []
  try {
    rects = await page.evaluate<typeof rects>(FIND_CANDIDATES) ?? []
  } catch {
    return null
  }
  if (!rects.length) return null

  for (const rect of rects) {
    let png: Buffer
    try {
      // 注意：clip 只能包含 x/y/width/height，多一个字段 Playwright 会直接拒绝
      const clip = { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      png = await page.screenshot({ clip, type: 'png' })
    } catch {
      continue
    }
    const dataUrl = `data:image/png;base64,${png.toString('base64')}`
    let result: DetectResult | null = null
    try {
      result = await page.evaluate<DetectResult | null>(analyseScript(dataUrl))
    } catch {
      result = null
    }
    if (!result) continue

    return {
      image: dataUrlToBuffer(result.dataUrl),
      matrix: result.matrix,
      modules: result.modules,
      size: result.size,
    }
  }
  // 盲截兜底：像素分析可能因为缩放/透明层失败，但元素本身是对的就够了
  const blind = pickQrRect(rects)
  if (blind) {
    try {
      const clip = { x: blind.x, y: blind.y, width: blind.width, height: blind.height }
      const png = await page.screenshot({ clip, type: 'png' })
      return {
        image: png,
        matrix: [],
        modules: 0,
        size: { width: blind.width, height: blind.height },
      }
    } catch { /* 落到下面返回 null */ }
  }

  return null
}

/** 盲截兜底：挑最像二维码的那个元素（类名命中 + 尺寸够大 + 接近正方） */
function pickQrRect(rects: Array<{ x: number; y: number; width: number; height: number; hint: string }>) {
  const scored = rects
    .map((rect) => {
      const named = /qr|code|scan|erweima/i.test(rect.hint) ? 2 : 0
      const size = rect.width >= 100 && rect.height >= 100 ? 2 : 0
      const ratio = rect.width / rect.height
      const square = ratio > 0.7 && ratio < 1.4 ? 1 : 0
      return { rect, score: named + size + square }
    })
    .filter((item) => item.score >= 3)
    .sort((a, b) => b.score - a.score || b.rect.width - a.rect.width)
  return scored[0]?.rect ?? null
}

/** 兼容旧调用名 */
export const detectQr = captureQr

/** dataURL → Buffer */
export function dataUrlToBuffer(dataUrl: string): Buffer {
  const base64 = dataUrl.split(',')[1] ?? ''
  return Buffer.from(base64, 'base64')
}

/**
 * 把矩阵画成控制台字符画。
 * 用半块字符（▀▄█）一行画两行模块：终端格子高约是宽的两倍，这样长宽比才对。
 */
export function renderQrForConsole(matrix: boolean[][], indent = '  '): string {
  const n = matrix.length
  if (!n) return ''
  const quiet = 2
  const size = n + quiet * 2
  const dark = (r: number, c: number): boolean => {
    const rr = r - quiet
    const cc = c - quiet
    if (rr < 0 || cc < 0 || rr >= n || cc >= n) return false
    return matrix[rr][cc]
  }
  const lines: string[] = []
  for (let y = 0; y < size; y += 2) {
    let line = indent
    for (let x = 0; x < size; x++) {
      const top = dark(y, x)
      const bottom = dark(y + 1, x)
      line += top && bottom ? '█' : top ? '▀' : bottom ? '▄' : ' '
    }
    lines.push(line.replace(/\s+$/, ''))
  }
  return lines.join('\n')
}

/** 打印到控制台（不走 logger，避免时间戳插进二维码中间） */
export function printQrToConsole(matrix: boolean[][], title: string): void {
  const art = renderQrForConsole(matrix)
  const frame = '─'.repeat(Math.min(110, Math.max(40, matrix.length + 6)))
  process.stdout.write(`\n${frame}\n${title}（${matrix.length}×${matrix.length} 模块）\n${art}\n${frame}\n\n`)
}
