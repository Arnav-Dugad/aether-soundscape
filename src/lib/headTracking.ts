import { useStore } from '../store'

type Stop = () => void
let stop: Stop | null = null

/** Rate-limit store writes: heading updates arrive at sensor/video rate. */
function headingWriter() {
  let last = 0
  let smoothed: number | null = null
  return (rad: number) => {
    // unwrap-aware exponential smoothing
    if (smoothed === null) smoothed = rad
    else {
      let d = rad - smoothed
      d = Math.atan2(Math.sin(d), Math.cos(d))
      smoothed += d * 0.35
    }
    const now = performance.now()
    if (now - last < 33) return
    last = now
    useStore.getState().set('heading', smoothed)
  }
}

/** Phone / tablet: turn your body and the field turns with you. */
async function startMotion(): Promise<Stop> {
  const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<'granted' | 'denied'> }
  if (typeof DOE?.requestPermission === 'function') {
    const res = await DOE.requestPermission()
    if (res !== 'granted') throw new Error('Motion permission was denied.')
  }
  if (!('DeviceOrientationEvent' in window)) throw new Error('Motion sensors are not available on this device.')
  const write = headingWriter()
  let origin: number | null = null
  let got = false
  const on = (e: DeviceOrientationEvent) => {
    const ev = e as DeviceOrientationEvent & { webkitCompassHeading?: number }
    const compass = ev.webkitCompassHeading ?? (e.alpha !== null ? 360 - e.alpha : null)
    if (compass === null) return
    got = true
    // the direction you're facing when tracking starts becomes "forward"
    origin ??= compass
    write(((compass - origin) * Math.PI) / 180)
  }
  addEventListener('deviceorientation', on)
  await new Promise((r) => setTimeout(r, 1200))
  if (!got) {
    removeEventListener('deviceorientation', on)
    throw new Error('No motion data — this device has no orientation sensor.')
  }
  return () => removeEventListener('deviceorientation', on)
}

/** Webcam: MediaPipe face landmarker estimates head yaw from the facial transformation matrix. */
async function startCamera(onVideo: (v: HTMLVideoElement | null) => void): Promise<Stop> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: 'user' }, audio: false })
  const video = document.createElement('video')
  video.srcObject = stream
  video.muted = true
  video.playsInline = true
  await video.play()
  const vision = await import('@mediapipe/tasks-vision')
  const fileset = await vision.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm')
  const landmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFacialTransformationMatrixes: true,
  })
  onVideo(video)
  const write = headingWriter()
  let raf = 0
  let lastTs = -1
  const loop = () => {
    raf = requestAnimationFrame(loop)
    if (video.readyState < 2 || video.currentTime === lastTs) return
    lastTs = video.currentTime
    const res = landmarker.detectForVideo(video, performance.now())
    const m = res.facialTransformationMatrixes?.[0]?.data
    if (!m) return
    // column-major 4x4: yaw from the rotation part. The camera mirrors you, so negate.
    const yaw = Math.atan2(m[8], m[10])
    write(-yaw * 1.6)
  }
  raf = requestAnimationFrame(loop)
  return () => {
    cancelAnimationFrame(raf)
    landmarker.close()
    stream.getTracks().forEach((t) => t.stop())
    onVideo(null)
  }
}

export async function setHeadTracking(mode: 'off' | 'motion' | 'camera', onVideo: (v: HTMLVideoElement | null) => void = () => {}) {
  stop?.()
  stop = null
  const st = useStore.getState()
  if (mode === 'off') {
    st.set('headTracking', 'off')
    st.set('heading', 0)
    return
  }
  try {
    stop = mode === 'motion' ? await startMotion() : await startCamera(onVideo)
    st.set('headTracking', mode)
    st.toast(mode === 'motion' ? 'Motion head tracking on — turn to explore' : 'Webcam head tracking on — turn your head', 'success')
  } catch (e) {
    st.set('headTracking', 'off')
    st.toast(e instanceof Error ? e.message : 'Head tracking failed', 'error')
  }
}
