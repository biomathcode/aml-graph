/**
 * Face-mesh capture for the collector's live selfie step.
 *
 * Uses the MediaPipe Face Landmarker (tasks-vision) loaded on demand from a
 * CDN — no npm dependency, and fully optional at runtime: if the model or the
 * WASM backend cannot be fetched (offline demos, restricted networks), the
 * selfie is still captured and simply carries no mesh telemetry.
 *
 * Landmarks are the canonical 478-point MediaPipe face mesh, normalized to
 * 0-1 image space, so they later overlay cleanly on the stored selfie in the
 * operator review view regardless of capture resolution.
 */
export type FaceLandmark = [number, number, number]

const CDN_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

let landmarkerPromise: Promise<any | null> | null = null

/** Cached loader; resolves to null when the model is unavailable. */
export function loadFaceLandmarker(): Promise<any | null> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      try {
        const url = `${CDN_ROOT}/vision_bundle.mjs`
        const vision: any = await import(/* @vite-ignore */ url)
        const fileset = await vision.FilesetResolver.forVisionTasks(
          `${CDN_ROOT}/wasm`,
        )
        return await vision.FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          runningMode: 'IMAGE',
          numFaces: 1,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
        })
      } catch (err) {
        console.warn(
          '[faceMesh] model unavailable — mesh capture disabled',
          err,
        )
        return null
      }
    })()
  }
  return landmarkerPromise
}

/**
 * Detects the face mesh on a captured frame.
 * Returns rounded normalized triples, or null when no face is found.
 */
export async function detectFaceMesh(
  source: HTMLCanvasElement | HTMLVideoElement,
): Promise<FaceLandmark[] | null> {
  const landmarker = await loadFaceLandmarker()
  if (!landmarker) return null
  try {
    const result = landmarker.detect(source)
    const first = result?.faceLandmarks?.[0]
    if (!first?.length) return null
    return (first as any[])
      .slice(0, 500)
      .map((p) => [
        Math.round(p.x * 10000) / 10000,
        Math.round(p.y * 10000) / 10000,
        Math.round((p.z ?? 0) * 10000) / 10000,
      ]) as FaceLandmark[]
  } catch (err) {
    console.warn('[faceMesh] detection failed', err)
    return null
  }
}

/** Contour rings (canonical MediaPipe face-mesh indices) drawn on top of the
 * landmark density so the baked overlay reads as a mesh, not a point cloud. */
const MESH_LOOPS: number[][] = [
  // Outer lip ring
  [
    61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0,
    37, 39, 40, 185,
  ],
  // Left / right eye rings
  [33, 7, 163, 144, 145, 153, 154, 155, 133],
  [263, 249, 390, 373, 374, 380, 381, 382, 362],
  // Eyebrows
  [70, 63, 105, 66, 107],
  [336, 296, 334, 293, 300],
  // Face oval / jaw
  [
    10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379,
    378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127,
    162, 21, 54, 103, 67, 109,
  ],
]

/**
 * Draws the captured face mesh onto a canvas (used to bake the mesh into the
 * uploaded selfie so operators see landmark coverage on the stored image).
 */
export function drawFaceMeshOverlay(
  ctx: CanvasRenderingContext2D,
  landmarks: FaceLandmark[],
  width: number,
  height: number,
) {
  if (!landmarks.length) return
  const pt = (i: number) => landmarks[i]
  const scale = Math.min(width, height) / 480

  ctx.save()
  for (const loop of MESH_LOOPS) {
    if (loop.some((i) => i >= landmarks.length)) continue
    ctx.beginPath()
    const start = pt(loop[0])
    ctx.moveTo(start[0] * width, start[1] * height)
    for (let k = 1; k < loop.length; k++) {
      const p = pt(loop[k % loop.length])
      ctx.lineTo(p[0] * width, p[1] * height)
    }
    ctx.closePath()
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)'
    ctx.lineWidth = Math.max(1, scale * 0.4)
    ctx.stroke()
  }
  ctx.fillStyle = 'rgba(125, 211, 252, 0.65)'
  for (const [x, y] of landmarks) {
    ctx.fillRect(x * width - scale / 2, y * height - scale / 2, scale, scale)
  }
  ctx.restore()
}

/** Renders an SVG landmark scatter for review-side preview (no baked image). */
export function faceMeshSvgPaths(landmarks: FaceLandmark[]): string {
  return MESH_LOOPS.filter((loop) => loop.every((i) => i < landmarks.length))
    .map(
      (loop) =>
        `M ${loop
          .map((i) => {
            const [x, y] = landmarks[i]
            return `${x * 100} ${y * 100}`
          })
          .join(' L ')} Z`,
    )
    .join(' ')
}
