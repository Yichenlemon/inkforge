import { probeLottie, lottieToSmil, renderFrames, buildFlipbook, lottieToGif, lottieToStatic } from '../server/lib/lottie.js'
import { countAnimations } from '../server/lib/svg.js'

const movingRect = {
  v: '5.7.4', fr: 30, ip: 0, op: 60, w: 300, h: 300, nm: 'moving', ddd: 0, assets: [], layers: [
    {
      ddd: 0, ind: 1, ty: 4, nm: 'rect', sr: 1,
      ks: {
        o: { a: 1, k: [{ t: 0, s: [0], i: { x: 0.5, y: 0.5 }, o: { x: 0.5, y: 0.5 } }, { t: 30, s: [100] }, { t: 60, s: [20] }] },
        r: { a: 1, k: [{ t: 0, s: [0], i: { x: 0.5, y: 0.5 }, o: { x: 0.5, y: 0.5 } }, { t: 60, s: [360] }] },
        p: { a: 1, k: [{ t: 0, s: [60, 60], i: { x: 0.4, y: 0.5 }, o: { x: 0.6, y: 0.5 } }, { t: 30, s: [220, 180] }, { t: 60, s: [60, 60] }] },
        a: { a: 0, k: [0, 0, 0] },
        s: { a: 1, k: [{ t: 0, s: [100, 100], i: { x: 0.5, y: 0.5 }, o: { x: 0.5, y: 0.5 } }, { t: 30, s: [140, 140] }, { t: 60, s: [100, 100] }] },
      },
      ao: 0,
      shapes: [{
        ty: 'gr', nm: 'g', it: [
          { ty: 'rc', d: 1, s: { a: 0, k: [120, 90] }, p: { a: 0, k: [0, 0] }, r: { a: 0, k: 16 } },
          { ty: 'fl', c: { a: 0, k: [0.12, 0.55, 0.92, 1] }, o: { a: 0, k: 100 } },
          { ty: 'st', c: { a: 0, k: [0.05, 0.2, 0.4, 1] }, o: { a: 0, k: 100 }, w: { a: 0, k: 4 } },
          { ty: 'tr', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } },
        ],
      }],
      ip: 0, op: 60, st: 0, bm: 0,
    },
    {
      ddd: 0, ind: 2, ty: 1, nm: 'bg', sc: '#FFE9C7', sw: 300, sh: 300,
      ks: { o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 0, k: [150, 150, 0] }, a: { a: 0, k: [0, 0, 0] }, s: { a: 0, k: [100, 100, 100] } },
      ip: 0, op: 60, st: 0, bm: 0,
    },
  ],
}

const withMask = JSON.parse(JSON.stringify(movingRect))
withMask.layers[0].hasMask = true
withMask.layers[0].masksProperties = [{ mode: 'a', pt: { a: 0, k: { c: true, v: [[0, 0], [100, 0], [100, 100]] } } }]

console.log('=== 1. probe (clean) ===')
const r1 = probeLottie(movingRect)
console.log('features:', r1.features, '| smil:', r1.capability.smil, '| suggested:', r1.suggested, '| frames:', r1.frames, '| durMs:', r1.durationMs)

console.log('\n=== 2. probe (with mask) ===')
const r2 = probeLottie(withMask)
console.log('smil:', r2.capability.smil, '| suggested:', r2.suggested, '| unsupported:', r2.unsupported)
console.log('notes:', r2.notes.map((n) => `${n.layer}=${n.ok ? 'ok' : n.reason}`))

console.log('\n=== 3. L1 SMIL ===')
const smil = lottieToSmil(movingRect)
console.log('warnings:', smil.warnings)
console.log('animations:', countAnimations(smil.svg))
console.log(smil.svg.slice(0, 700))

console.log('\n=== 4. L2 frames flipbook ===')
const frames = await renderFrames(movingRect, { maxFrames: 12 })
console.log('rendered frames:', frames.frames.length, 'fps:', frames.fps, 'size:', frames.width + 'x' + frames.height)
const fb = buildFlipbook(frames, { loop: true })
console.log('flipbook len:', fb.length, '| groups:', (fb.match(/<g display="none">/g) ?? []).length)
console.log(fb.slice(0, 320))

console.log('\n=== 5. L3 GIF ===')
const gif = await lottieToGif(movingRect, { width: 240, maxFrames: 20 })
console.log('gif bytes:', gif.buffer.length, 'frames:', gif.frames, 'size:', gif.width + 'x' + gif.height)

console.log('\n=== 6. L4 static ===')
const st = await lottieToStatic(movingRect)
console.log('static len:', st.length)
console.log(st.slice(0, 240))
process.exit(0)
