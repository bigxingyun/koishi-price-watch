import type { PageLike } from './browser'

/**
 * 人化操作层（反反爬的基础设施）。
 *
 * 思路：不要再「直接打开商品页」——那是爬虫最明显的特征。
 * 改成真人路径：**首页 → 搜索 → 滚一滚 → 移动鼠标 → 点进商品卡**，
 * 每步带随机停顿。慢一点没关系，拿得到数据才有意义。
 *
 * 这个文件只做「像人一样操作」，不含任何平台知识，三个适配器共用。
 */

type KeyboardLike = { type?: (text: string, options?: Record<string, unknown>) => Promise<unknown>; press?: (key: string) => Promise<unknown> }

export interface HumanOptions {
  /** 单步停顿范围（毫秒） */
  delay?: [number, number]
  /** 页面内滚动次数 */
  scrolls?: number
  /** 是否移动鼠标 */
  mouse?: boolean
}

const DEFAULT_DELAY: [number, number] = [600, 1800]

/**
 * 在首页的搜索框里输入关键词并回车。
 *
 * 为什么必须这样：京东/拼多多的搜索接口要带 h5st 等签名参数，
 * 直接拼 URL 访问会被判「请求无效」。把关键词敲进搜索框、按回车，
 * 请求由页面自己发出，签名也就由页面自己生成 —— 这才是仿真的意义。
 */

/**
 * 真人式搜索：真实鼠标点输入框 → 真实键盘逐字输入 → 真实鼠标点「搜索」按钮。
 *
 * 为什么必须这样：京东首页搜索框是 React 受控组件，用 evaluate 派发合成事件
 * React 不认（合成事件不会更新组件 state），所以之前一直「输入了但不跳转」。
 * Playwright 的 page.mouse / page.keyboard 走 CDP，是真实输入，React 会正常处理。
 */
export async function humanSearchReal(
  page: PageLike,
  keyword: string,
  options: HumanOptions = {},
): Promise<boolean> {
  const p = page as unknown as {
    mouse?: { click?: (x: number, y: number) => Promise<unknown>; move?: (x: number, y: number) => Promise<unknown> }
    keyboard?: { type?: (text: string, options?: Record<string, unknown>) => Promise<unknown>; press?: (key: string) => Promise<unknown> }
    evaluate: <T = unknown>(script: string) => Promise<T>
  }
  if (!p.mouse?.click || !p.keyboard?.type) return false

  // ① 找到搜索输入框的坐标
  const inputBox = await page
    .evaluate<{ x: number; y: number } | null>(String.raw`(() => {
      const input = document.querySelector('input[type="search"], input.jd_pc_search_bar_react_search_input, input[name="keyword"], input#key, input[type="text"]')
      if (!input) return null
      const r = input.getBoundingClientRect()
      if (r.width < 20 || r.height < 10) return null
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    })()`)
    .catch(() => null)
  if (!inputBox) return false

  // ② 真实鼠标点击 + 真实键盘输入
  await p.mouse.move?.(inputBox.x, inputBox.y).catch(() => undefined)
  await humanDelay({ delay: [120, 320] })
  await p.mouse.click(inputBox.x, inputBox.y).catch(() => undefined)
  await humanDelay({ delay: [200, 500] })

  for (const char of keyword) {
    await p.keyboard.type(char, { delay: 40 + Math.floor(Math.random() * 120) }).catch(() => undefined)
  }
  await humanDelay({ delay: [400, 900] })

  // ③ 先按真实回车：聚焦的 React 输入框会触发 onKeyDown 提交
  await p.keyboard.press?.('Enter').catch(() => undefined)
  await new Promise((resolve) => setTimeout(resolve, 2500))
  const afterEnter = await page.evaluate<string>('location.href').catch(() => '')
  const moved = !/^https?:\/\/(www\.)?jd\.com\/?$|^https:\/\/www\.jd\.com\/?$/i.test(afterEnter)
  if (moved) return true

  // ④ 回车没跳转，再找「搜索」按钮的坐标真实点击
  const btnBox = await page
    .evaluate<{ x: number; y: number } | null>(String.raw`(() => {
      const nodes = Array.from(document.querySelectorAll('button, a, div, span, i'))
      for (const el of nodes) {
        const t = (el.textContent || '').replace(/\s+/g, '').trim()
        if (t !== '搜索' && t !== '搜本店' && t !== '查询') continue
        const r = el.getBoundingClientRect()
        if (r.width < 14 || r.height < 12) continue
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
      }
      return null
    })()`)
    .catch(() => null)

  if (btnBox) {
    await p.mouse.move?.(btnBox.x, btnBox.y).catch(() => undefined)
    await humanDelay({ delay: [80, 200] })
    await p.mouse.click(btnBox.x, btnBox.y).catch(() => undefined)
  } else {
    await p.keyboard.press?.('Enter').catch(() => undefined)
  }

  await new Promise((resolve) => setTimeout(resolve, 3500))
  return true
}

export async function humanSearch(page: PageLike, keyword: string, options: HumanOptions = {}): Promise<boolean> {
  const selector = 'input[type="search"], input[name="keyword"], input[name="search"], input[placeholder*="搜索"]'
  const ok = await page
    .evaluate<boolean>(`(async () => {
      const input = document.querySelector(${JSON.stringify(selector)})
      if (!input) return false
      input.focus()
      input.click()
      return true
    })()`)
    .catch(() => false)
  if (!ok) return false

  await humanDelay({ delay: [200, 600] })
  // 逐字输入，比一次性塞 value 更像人
  const keys = (page as unknown as { keyboard?: KeyboardLike }).keyboard
  if (keys?.type) {
    for (const char of keyword) {
      await keys.type(char, { delay: 60 + Math.floor(Math.random() * 90) }).catch(() => undefined)
    }
    // React 受控组件：键盘输入有时不进入组件状态，这里用原生 setter + 事件兜底
    const filled = await page
      .evaluate<boolean>(String.raw`(() => {
        const input = document.querySelector('input[type="search"], input.jd_pc_search_bar_react_search_input, input[name="keyword"], input[type="text"]')
        if (!input) return false
        const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")
        const nativeSetter = desc && desc.set
        if (nativeSetter) nativeSetter.call(input, ${JSON.stringify(keyword)})
        else input.value = ${JSON.stringify(keyword)}
        input.dispatchEvent(new Event("input", { bubbles: true }))
        input.dispatchEvent(new Event("change", { bubbles: true }))
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }))
        input.dispatchEvent(new KeyboardEvent("keypress", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }))
        input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }))
        return true
      })()`)
      .catch(() => false)
    await humanDelay({ delay: [300, 800] })

    // React 受控输入框回车往往不触发提交，优先点旁边的「搜索」按钮
    const clickedSearch = await page
      .evaluate<boolean>(String.raw`(() => {
        const btns = Array.from(document.querySelectorAll('button, a, div, span'))
        const hit = btns.find((el) => {
          const t = (el.textContent || '').replace(/\s+/g, '').trim()
          if (t !== '搜索' && t !== '搜本店' && t !== '查询') return false
          const r = el.getBoundingClientRect()
          return r.width > 10 && r.height > 10
        })
        if (!hit) return false
        const r = hit.getBoundingClientRect()
        hit.dispatchEvent(new MouseEvent('mouseover', { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true }))
        hit.dispatchEvent(new MouseEvent('mousedown', { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true }))
        hit.dispatchEvent(new MouseEvent('mouseup', { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true }))
        hit.dispatchEvent(new MouseEvent('click', { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, cancelable: true }))
        return true
      })()`)
      .catch(() => false)

    if (!clickedSearch) await keys.press?.('Enter').catch(() => undefined)
    await new Promise((resolve) => setTimeout(resolve, rand(1800, 3200)))
    return true
  }

  // 没有 keyboard 支持时退回直接设值 + 提交表单
  return page
    .evaluate<boolean>(`(() => {
      const input = document.querySelector(${JSON.stringify(selector)})
      if (!input) return false
      const form = input.closest("form")
      if (form) { form.submit(); return true }
      return false
    })()`)
    .catch(() => false)
}


function rand(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min))
}

export async function humanDelay(options: HumanOptions = {}): Promise<void> {
  const [min, max] = options.delay ?? DEFAULT_DELAY
  await new Promise((resolve) => setTimeout(resolve, rand(min, max)))
}

/** 随机滚动几屏，模拟人在浏览列表 */
export async function humanScroll(page: PageLike, options: HumanOptions = {}): Promise<void> {
  const scrolls = options.scrolls ?? 3
  for (let i = 0; i < scrolls; i++) {
    const delta = rand(200, 700)
    await page
      .evaluate(`window.scrollBy(0, ${delta})`)
      .catch(() => undefined)
    await humanDelay({ delay: [180, 520] })
  }
}

/** 在页面里随机移动几次鼠标（触发 mousemove，不做真实点击） */
export async function humanMouse(page: PageLike, options: HumanOptions = {}): Promise<void> {
  if (options.mouse === false) return
  const moves = rand(2, 4)
  for (let i = 0; i < moves; i++) {
    await page
      .evaluate(
        `(() => {
          const x = Math.floor(Math.random() * window.innerWidth)
          const y = Math.floor(Math.random() * window.innerHeight)
          for (const type of ['mousemove', 'mouseover']) {
            document.body.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }))
          }
        })()`,
      )
      .catch(() => undefined)
    await humanDelay({ delay: [120, 380] })
  }
}

/**
 * 从搜索页点进目标商品。
 *
 * 优先点「链接里含 itemId」的商品卡；找不到就点第一个看起来像商品的卡片。
 * 返回 true 表示是点击进入的（不是直接跳转）。
 */
export async function clickProductFromSearch(
  page: PageLike,
  itemId: string,
  options: HumanOptions = {},
): Promise<boolean> {
  await humanScroll(page, options)
  await humanMouse(page, options)

  const clicked = await page
    .evaluate<boolean>(`(() => {
      const id = ${JSON.stringify(itemId)}
      const anchors = Array.from(document.querySelectorAll('a[href]'))
      // 只点「链接里含目标商品 ID」的那一张卡。
      // 找不到就返回 false 交给调用方退回直连 —— 宁可失败，也不能点错商品报错价。
      const card = anchors.find((a) => (a.href || '').includes(id))
      if (!card) return false
      card.scrollIntoView({ block: 'center' })
      const rect = card.getBoundingClientRect()
      const x = rect.left + rect.width / 2
      const y = rect.top + rect.height / 2
      for (const type of ['mouseover', 'mousedown', 'mouseup', 'click']) {
        card.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true }))
      }
      return true
    })()`)
    .catch(() => false)

  if (!clicked) return false
  // 等跳转/新标签页
  await new Promise((resolve) => setTimeout(resolve, rand(1500, 3200)))
  return true
}

/**
 * 真人路径进入商品页：首页 → 搜索 → 点击。
 * 任何一步失败都返回 false，由调用方决定是否回退到直连。
 */
export async function browseToProduct(
  page: PageLike,
  urls: { home: string; search: (keyword: string) => string },
  itemId: string,
  keyword: string,
  options: HumanOptions = {},
): Promise<boolean> {
  if (!page.goto) return false
  try {
    // ① 首页：先建立“正常访客”的会话
    await page.goto(urls.home, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await humanDelay(options)
    await humanMouse(page, options)
    await humanScroll(page, { ...options, scrolls: 2 })

    // ② 搜索：优先在首页搜索框里输入（页面自己带签名），失败才拼 URL
    const searched = await humanSearch(page, keyword, options).catch(() => false)
    if (!searched) {
      await page.goto(urls.search(keyword), { waitUntil: 'domcontentloaded', timeout: 30000 })
    }
    await humanDelay({ ...options, delay: [1200, 2600] })

    // ③ 点进商品
    return await clickProductFromSearch(page, itemId, options)
  } catch {
    return false
  }
}

/**
 * 按标题点商品卡（不需要商品 ID）。
 *
 * 拼多多的商品卡既不是 <a> 也没有 data-goods-id，所以不能靠 href 找，
 * 只能像人一样：在列表里认出写着型号的那一块，点它的中心。
 * 用真实鼠标事件点击（page.mouse），触发的是页面自己的跳转，不构造 URL。
 */
export async function clickProductByKeyword(page: PageLike, keyword: string): Promise<boolean> {
  const tokens = keyword.split(/\s+/).filter((part) => part.length >= 2)
  const point = await page
    .evaluate<{ x: number; y: number } | null>(`(() => {
      const tokens = ${JSON.stringify(tokens)}
      const clean = (s) => (s || "").replace(/[\u200b-\u200d]/g, "").replace(/\s+/g, " ").trim()
      const nodes = Array.from(document.querySelectorAll("div, li, section, article"))
        .filter((el) => {
          const text = clean(el.textContent)
          if (!text || text.length > 120) return false
          if (!/[¥￥]\s*[0-9]/.test(text)) return false
          return tokens.some((tk) => text.toLowerCase().includes(String(tk).toLowerCase()))
        })
      if (!nodes.length) return null
      // 取最深（最贴近商品卡）的那个
      const target = nodes[nodes.length - 1]
      target.scrollIntoView({ block: "center" })
      const rect = target.getBoundingClientRect()
      if (rect.width < 40 || rect.height < 20) return null
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    })()`)
    .catch(() => null)
  if (!point) return false

  const mouse = (page as unknown as { mouse?: { click?: (x: number, y: number) => Promise<unknown> } }).mouse
  if (mouse?.click) {
    await mouse.click(point.x, point.y).catch(() => undefined)
  } else {
    await page
      .evaluate(`(() => {
        const el = document.elementFromPoint(${point.x}, ${point.y})
        if (!el) return false
        for (const type of ["mousedown", "mouseup", "click"]) {
          el.dispatchEvent(new MouseEvent(type, { clientX: ${point.x}, clientY: ${point.y}, bubbles: true, cancelable: true }))
        }
        return true
      })()`)
      .catch(() => undefined)
  }
  await new Promise((resolve) => setTimeout(resolve, rand(2000, 3500)))
  return true
}


/**
 * 取「当前标签页之外新打开的那个标签页」。
 *
 * 拼多多等平台点搜索会在新标签页里打开结果，不接管新页就会一直在旧页上找商品卡，
 * 表现为「找不到可点开的商品卡」——这不是仿真没生效，是盯错了页面。
 */
export async function waitForNewPage(
  browser: unknown,
  current: unknown,
  timeoutMs = 4000,
): Promise<PageLike | null> {
  const ctx = browser as { pages?: () => Array<unknown>; waitForEvent?: (event: string, options?: { timeout?: number }) => Promise<unknown> }
  const pages = ctx?.pages?.() ?? []
  const existing = pages.find((candidate) => candidate !== current)
  if (existing) return existing as PageLike
  if (!ctx?.waitForEvent) return null
  try {
    return (await ctx.waitForEvent("page", { timeout: timeoutMs })) as PageLike
  } catch {
    return null
  }
}

/**
 * 仿真进入商品页并返回「真正进入后的页面」。
 * 搜索可能开新标签，所以返回的 page 未必是传入的那个。
 */
export async function enterProductByHuman(
  page: PageLike,
  homeUrl: string,
  keyword: string,
  options: HumanOptions = {},
  browser?: unknown,
): Promise<{ entered: boolean; page: PageLike; reason?: string }> {
  if (!page.goto) return { entered: false, page, reason: "浏览器不支持 goto" }
  await page.goto(homeUrl, { waitUntil: "domcontentloaded", timeout: 30000 })
  await humanDelay(options)
  await humanMouse(page, options)
  await humanScroll(page, { ...options, scrolls: 2 })

  const searched = await humanSearch(page, keyword, options)
  if (!searched) return { entered: false, page, reason: "首页没有可用的搜索框" }

  // 搜索可能开新标签页：等一会儿并接管它
  let target = page
  if (browser) {
    const fresh = await waitForNewPage(browser, page, 3500)
    if (fresh) {
      target = fresh
      // 新标签刚打开时是 about:blank，必须等它真的加载出搜索结果
      for (let i = 0; i < 15; i++) {
        await new Promise((resolve) => setTimeout(resolve, 800))
        const state = await target
          .evaluate<{ href: string; len: number }>(`({
            href: location.href,
            len: (document.body ? document.body.innerText : '').replace(/[\\u200b-\\u200d]/g, '').replace(/\\s+/g, ' ').length,
          })`)
          .catch(() => null)
        if (state && !/^about:blank/.test(state.href) && state.len > 200) break
      }
      await humanScroll(target, { ...options, scrolls: 2 })
    }
  }

  const clicked = await clickProductByKeyword(target, keyword)
  if (!clicked) return { entered: false, page: target, reason: "搜索结果里没有可点开的商品卡" }
  return { entered: true, page: target }
}
