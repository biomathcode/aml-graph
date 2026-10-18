import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Camera,
  ImagePlus,
  Loader2,
  RefreshCw,
  SwitchCamera,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '~/components/ui/button'
import { detectFaceMesh, drawFaceMeshOverlay } from './faceMesh'
import type { FaceLandmark } from './faceMesh'

export interface CameraCapture {
  /** Capture preview/dataURL (PNG), with the face mesh baked in for selfies. */
  dataUrl: string
  /** Normalized face landmarks, when mesh detection succeeded. */
  faceMesh?: FaceLandmark[]
  faceMeshError?: string
}

interface LiveCameraProps {
  mode: 'selfie' | 'document'
  title: string
  guidance: string[]
  /** Existing capture being replaced (shows Retake state). */
  preview?: { dataUrl: string; label?: string } | null
  uploading?: boolean
  onCapture: (capture: CameraCapture) => void
  onReset?: () => void
}

const MAX_EDGE = 1600

/**
 * Live getUserMedia capture used for both the biometric selfie (with face-mesh
 * telemetry) and direct photos of identity documents — replacing the capture
 * file-input with a real in-browser camera.
 */
export function LiveCamera({
  mode,
  title,
  guidance,
  preview,
  uploading,
  onCapture,
  onReset,
}: LiveCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [live, setLive] = useState(false)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [starting, setStarting] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [meshStatus, setMeshStatus] = useState<
    'idle' | 'loading' | 'ready' | 'unavailable'
  >('idle')
  const [error, setError] = useState<string | null>(null)

  // Current device request, so a switch during stream warm-up isn't raced.
  const wanted = useRef<string | null>(null)
  wanted.current = deviceId

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setLive(false)
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  useEffect(() => () => stopStream(), [stopStream])

  const startStream = useCallback(
    async (preferred?: string) => {
      if (streamRef.current) stopStream()
      setError(null)
      try {
        const facing = mode === 'selfie' ? 'user' : 'environment'
        const constraints: MediaStreamConstraints = {
          video: preferred
            ? { deviceId: { exact: preferred } }
            : {
                facingMode: facing,
                width: { ideal: 1920 },
                height: { ideal: 1080 },
              },
          audio: false,
        }
        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        if (wanted.current !== (preferred ?? null) && preferred) {
          // Device was switched while warming up — retry with the new choice.
          stream.getTracks().forEach((t) => t.stop())
          return startStream(wanted.current ?? undefined)
        }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
        await videoRef.current?.play().catch(() => undefined)
        setLive(true)
        setPermissionDenied(false)
        // Device labels only resolve after a successful grant.
        const all = await navigator.mediaDevices.enumerateDevices()
        const cams = all.filter((d) => d.kind === 'videoinput')
        setDevices(cams)
        const active = stream.getVideoTracks()[0]?.getSettings().deviceId
        if (active) setDeviceId(active)
      } catch (err) {
        console.warn('[LiveCamera] start failed', err)
        setPermissionDenied(true)
        setError(
          'Camera access failed. Check browser permissions (HTTPS is required on mobile browsers).',
        )
      } finally {
        setStarting(false)
      }
    },
    [stopStream, mode],
  )

  function enable() {
    setStarting(true)
    void startStream()
  }

  function switchCamera() {
    if (devices.length < 2) return
    const idx = devices.findIndex((d) => d.deviceId === deviceId)
    const next = devices[(idx + 1) % devices.length]
    setDeviceId(next.deviceId)
    void startStream(next.deviceId)
  }

  async function capture() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !video.videoWidth) return
    setCapturing(true)
    try {
      let { videoWidth: w, videoHeight: h } = video
      if (Math.max(w, h) > MAX_EDGE) {
        const k = MAX_EDGE / Math.max(w, h)
        w = Math.round(w * k)
        h = Math.round(h * k)
      }
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      // Mirror selfies so the saved image matches the mirrored preview the
      // subject saw (standard front-camera behavior).
      if (mode === 'selfie') (ctx.translate(w, 0), ctx.scale(-1, 1))
      ctx.drawImage(video, 0, 0, w, h)
      ctx.setTransform(1, 0, 0, 1, 0, 0)

      let faceMesh: FaceLandmark[] | undefined
      let faceMeshError: string | undefined
      if (mode === 'selfie') {
        setMeshStatus('loading')
        const landmarks = await detectFaceMesh(canvas)
        if (landmarks?.length) {
          faceMesh = landmarks
          drawFaceMeshOverlay(ctx, landmarks, w, h)
          setMeshStatus('ready')
        } else {
          setMeshStatus('unavailable')
          faceMeshError = 'mesh-unavailable'
        }
      }
      onCapture({
        dataUrl: canvas.toDataURL('image/png'),
        faceMesh,
        faceMeshError,
      })
      toast.success(mode === 'selfie' ? 'Selfie captured' : 'Photo captured')
    } catch (err) {
      console.error('[LiveCamera] capture failed', err)
      toast.error('Capture failed — try again')
    } finally {
      setCapturing(false)
    }
  }

  async function handleFileFallback(file: File) {
    // Poor-camera fallback: an uploaded image file still produces the same
    // capture object (no mesh telemetry in this path).
    try {
      setCapturing(true)
      const bitmap = await createImageBitmap(file)
      const canvas = canvasRef.current
      if (!canvas) return
      let { width: w, height: h } = bitmap
      if (Math.max(w, h) > MAX_EDGE) {
        const k = MAX_EDGE / Math.max(w, h)
        w = Math.round(w * k)
        h = Math.round(h * k)
      }
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.drawImage(bitmap, 0, 0, w, h)
      onCapture({ dataUrl: canvas.toDataURL('image/png') })
      toast.success('Photo captured from file')
    } catch {
      toast.error('Could not read that image file')
    } finally {
      setCapturing(false)
    }
  }

  return (
    <div className="space-y-4">
      <canvas ref={canvasRef} className="hidden" />

      {!permissionDenied && (
        <div className="relative w-full aspect-[4/3] bg-black rounded-2xl overflow-hidden border">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`absolute inset-0 w-full h-full object-cover ${
              mode === 'selfie' ? 'scale-x-[-1]' : ''
            }`}
          />
          {/* Guidance overlay */}
          <div className="absolute inset-0 pointer-events-none">
            <div
              className={`absolute border-2 border-dashed border-emerald-300/70 ${
                mode === 'selfie'
                  ? 'left-1/2 -translate-x-1/2 top-[8%] w-[52%] aspect-[3/4] rounded-full'
                  : 'inset-[7%] rounded-xl'
              }`}
            />
          </div>
          {!live && (
            <div className="absolute inset-0 grid place-items-center bg-black/60">
              <Button
                intent="secondary"
                isDisabled={starting}
                onClick={enable}
                className="flex items-center gap-2"
              >
                {starting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Camera className="size-4" />
                )}
                {starting ? 'Starting camera…' : 'Enable camera'}
              </Button>
            </div>
          )}
          {live && devices.length > 1 && (
            <button
              type="button"
              onClick={switchCamera}
              className="absolute right-3 top-3 p-2 rounded-full bg-black/60 text-white hover:bg-black/80 transition"
              title="Switch camera"
            >
              <SwitchCamera className="size-4" />
            </button>
          )}
        </div>
      )}

      {permissionDenied && !preview && (
        <label className="block border-2 border-dashed border-neutral-300 hover:border-primary rounded-2xl p-6 text-center cursor-pointer bg-neutral-50/50">
          <ImagePlus className="mx-auto size-8 text-primary mb-2" />
          <p className="font-semibold text-sm">
            Camera unavailable — upload a photo instead
          </p>
          <p className="text-xs text-muted-fg mt-1">JPEG or PNG, up to 20MB</p>
          <input
            type="file"
            className="hidden"
            accept="image/jpeg,image/png,image/webp"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void handleFileFallback(f)
              e.target.value = ''
            }}
          />
        </label>
      )}

      {live && (
        <div className="flex flex-col gap-3">
          <Button
            intent="primary"
            isDisabled={capturing || uploading}
            onClick={capture}
            className="flex items-center justify-center gap-2"
          >
            {capturing || uploading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Camera className="size-4" />
            )}
            {title}
          </Button>
          <label className="text-center cursor-pointer text-xs text-primary hover:underline">
            or upload an existing photo
            <input
              type="file"
              className="hidden"
              accept="image/jpeg,image/png,image/webp"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void handleFileFallback(f)
                e.target.value = ''
              }}
            />
          </label>
        </div>
      )}

      {preview && (
        <div className="p-3 border rounded-2xl bg-neutral-50 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-fg">
              {preview.label || 'Captured'}
            </span>
            {onReset && (
              <Button
                intent="outline"
                size="xs"
                onClick={onReset}
                className="flex items-center gap-1"
              >
                <RefreshCw className="size-3" />
                Retake
              </Button>
            )}
          </div>
          <div className="relative rounded-xl overflow-hidden border bg-white">
            <img src={preview.dataUrl} alt="Captured" className="w-full" />
            {onReset && (
              <button
                type="button"
                onClick={onReset}
                className="absolute right-2 top-2 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80 transition"
                title="Retake"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      <ul className="text-xs text-muted-fg space-y-1.5">
        {guidance.map((g) => (
          <li key={g} className="flex items-start gap-1.5">
            <span className="mt-0.5 size-1.5 rounded-full bg-primary shrink-0" />
            {g}
          </li>
        ))}
      </ul>

      {mode === 'selfie' && meshStatus !== 'idle' && (
        <p className="text-[11px] font-medium">
          {meshStatus === 'ready' && (
            <span className="text-emerald-700">
              ✓ 478-point face mesh captured
            </span>
          )}
          {meshStatus === 'loading' && (
            <span className="text-neutral-500 italic">
              Analyzing face geometry…
            </span>
          )}
          {meshStatus === 'unavailable' && (
            <span className="text-amber-700">
              Face mesh model unavailable (offline?) — selfie will be captured
              without landmark telemetry.
            </span>
          )}
        </p>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
