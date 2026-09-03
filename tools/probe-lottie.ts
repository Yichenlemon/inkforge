import { JSDOM } from 'jsdom'

const sample = {
  v: '5.7.4', fr: 30, ip: 0, op: 30, w: 200, h: 200, nm: 'test', ddd: 0, assets: [], layers: [
    {
      ddd: 0, ind: 1, ty: 4, nm: 'rect', sr: 1,
      ks: {
        o: { a: 0, k: 100 }, r: { a: 0, k: 0 },
        p: {
          a: 1, k: [
            { t: 0, s: [50, 50], i: { x: 0.5, y: 0.5 }, o: { x: 0.5, y: 0.5 } },
            { t: 30, s: [150, 150] },
          ],
        },
        a: { a: 0, k: [0, 0] },
        s: {
          a: 1, k: [
            { t: 0, s: [100, 100], i: { x: 0.5, y: 0.5 }, o: { x: 0.5, y: 0.5 } },
            { t: 30, s: [50, 50] },
          ],
        },
      },
      ao: 0,
      shapes: [
        {
          ty: 'gr', nm: 'g', it: [
            { ty: 'rc', d: 1, s: { a: 0, k: [80, 80] }, p: { a: 0, k: [0, 0] }, r: { a: 0, k: 12 } },
            { ty: 'fl', c: { a: 0, k: [0.2, 0.6, 0.9, 1] }, o: { a: 0, k: 100 } },
            { ty: 'tr', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } },
          ],
        },
      ],
      ip: 0, op: 30, st: 0, bm: 0,
    },
  ],
}

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="c"></div></body></html>', { pretendToBeVisual: true })
const g: any = globalThis
const set = (k: string, v: any) => Object.defineProperty(g, k, { value: v, configurable: true, writable: true })
set('window', dom.window)
set('document', dom.window.document)
set('navigator', dom.window.navigator)
set('HTMLElement', dom.window.HTMLElement)
set('SVGElement', dom.window.SVGElement)
set('requestAnimationFrame', dom.window.requestAnimationFrame.bind(dom.window))
set('cancelAnimationFrame', dom.window.cancelAnimationFrame.bind(dom.window))
// jsdom 无 canvas，给 lottie 一个文本测量桩
const stubCtx = {
  font: '', fillStyle: '', strokeStyle: '', textBaseline: '', textAlign: '', globalAlpha: 1, lineWidth: 1,
  measureText: (t: string) => ({ width: String(t).length * 8 }),
  fillText() {}, strokeText() {}, fillRect() {}, clearRect() {}, strokeRect() {},
  save() {}, restore() {}, translate() {}, scale() {}, rotate() {}, beginPath() {}, closePath() {},
  moveTo() {}, lineTo() {}, bezierCurveTo() {}, quadraticCurveTo() {}, arc() {}, fill() {}, stroke() {},
  clip() {}, setTransform() {}, transform() {}, drawImage() {},
  createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
  getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
  putImageData() {},
}
;(dom.window as any).HTMLCanvasElement.prototype.getContext = () => stubCtx

const lottie: any = (await import('lottie-web')).default
const container = dom.window.document.getElementById('c')!
const anim = lottie.loadAnimation({
  container, renderer: 'svg', loop: false, autoplay: false, animationData: sample,
})

await new Promise((r) => setTimeout(r, 300))
const total = anim.totalFrames
console.log('totalFrames =', total)
for (const f of [0, 15, 29]) {
  anim.goToAndStop(f, true)
  const svg = container.innerHTML
  console.log(`frame ${f}: len=${svg.length} head=${svg.slice(0, 110).replace(/\n/g, ' ')}`)
}
console.log('--- full frame0 ---')
anim.goToAndStop(0, true)
console.log(container.innerHTML.slice(0, 900))
process.exit(0)
