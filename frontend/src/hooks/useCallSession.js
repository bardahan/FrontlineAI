import { useState, useRef, useCallback, useEffect } from 'react'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'
const WS_URL = API_BASE.replace('https://', 'wss://').replace('http://', 'ws://') + '/ws/browser'

export function useCallSession() {
  const [status, setStatus] = useState('idle') // idle | connecting | active
  const statusRef = useRef('idle')
  const wsRef = useRef(null)
  const captureCtxRef = useRef(null)
  const playCtxRef = useRef(null)
  const processorRef = useRef(null)
  const streamRef = useRef(null)
  const playbackTimeRef = useRef(0)

  const updateStatus = useCallback((s) => {
    statusRef.current = s
    setStatus(s)
  }, [])

  const cleanup = useCallback(() => {
    if (processorRef.current) {
      try { processorRef.current.disconnect() } catch (_) {}
      processorRef.current = null
    }
    if (captureCtxRef.current) {
      try { captureCtxRef.current.close() } catch (_) {}
      captureCtxRef.current = null
    }
    if (playCtxRef.current) {
      try { playCtxRef.current.close() } catch (_) {}
      playCtxRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (wsRef.current) {
      try { wsRef.current.close() } catch (_) {}
      wsRef.current = null
    }
    playbackTimeRef.current = 0
    updateStatus('idle')
  }, [updateStatus])

  const startCall = useCallback(async () => {
    updateStatus('connecting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
        },
      })
      streamRef.current = stream

      const captureCtx = new AudioContext({ sampleRate: 16000 })
      captureCtxRef.current = captureCtx

      const playCtx = new AudioContext({ sampleRate: 24000 })
      playCtxRef.current = playCtx
      playbackTimeRef.current = playCtx.currentTime

      const ws = new WebSocket(WS_URL)
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      ws.onopen = async () => {
        if (captureCtx.state === 'suspended') await captureCtx.resume()
        updateStatus('active')

        const source = captureCtx.createMediaStreamSource(stream)
        const processor = captureCtx.createScriptProcessor(4096, 1, 1)
        processorRef.current = processor

        processor.onaudioprocess = (e) => {
          if (ws.readyState !== WebSocket.OPEN) return
          const float32 = e.inputBuffer.getChannelData(0)
          const int16 = new Int16Array(float32.length)
          for (let i = 0; i < float32.length; i++) {
            const s = Math.max(-1, Math.min(1, float32[i]))
            int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
          }
          ws.send(int16.buffer)
        }

        source.connect(processor)
        processor.connect(captureCtx.destination)
      }

      ws.onmessage = async (e) => {
        if (!(e.data instanceof ArrayBuffer)) return
        const playCtx = playCtxRef.current
        if (!playCtx) return
        if (playCtx.state === 'suspended') await playCtx.resume()

        const int16 = new Int16Array(e.data)
        const float32 = new Float32Array(int16.length)
        for (let i = 0; i < int16.length; i++) {
          float32[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7FFF)
        }

        const buffer = playCtx.createBuffer(1, float32.length, 24000)
        buffer.copyToChannel(float32, 0)

        const source = playCtx.createBufferSource()
        source.buffer = buffer

        const now = playCtx.currentTime
        const startAt = Math.max(now, playbackTimeRef.current)
        playbackTimeRef.current = startAt + buffer.duration

        source.connect(playCtx.destination)
        source.start(startAt)
      }

      ws.onerror = (e) => {
        console.error('[useCallSession] WebSocket error', e)
        cleanup()
      }

      ws.onclose = () => {
        if (statusRef.current !== 'idle') cleanup()
      }

    } catch (e) {
      console.error('[useCallSession] startCall error:', e)
      alert(e.message || 'Failed to start call')
      cleanup()
    }
  }, [cleanup, updateStatus])

  const endCall = useCallback(() => { cleanup() }, [cleanup])

  useEffect(() => () => cleanup(), [cleanup])

  return { status, startCall, endCall }
}
