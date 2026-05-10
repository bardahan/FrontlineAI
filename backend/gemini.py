"""
Gemini Live API helpers and session management.
Uses google-genai SDK (v1alpha) for transcription support.
Audio conversion uses numpy only (no audioop — Python 3.14 compatible).
"""

import asyncio
import base64
import logging
import os
from typing import Callable, Optional

import httpx
import numpy as np
from dotenv import load_dotenv
from google import genai
from google.genai import types

from timezone_utils import now_in_tz

load_dotenv()

logger = logging.getLogger("frontline_ai.gemini")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = "gemini-3.1-flash-live-preview"
GEMINI_VOICES = [
    "Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede",
    "Callirrhoe", "Autonoe", "Enceladus", "Iapetus", "Umbriel", "Algieba",
    "Despina", "Erinome", "Algenib", "Rasalgethi", "Laomedeia", "Achernar",
    "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird", "Zubenelgenubi",
    "Vindemiatrix", "Sadachbia", "Sadaltager", "Sulafat",
]


# ─── µ-law codec (no audioop) ─────────────────────────────────────────────────

_ULAW_BIAS = 0x84
_ULAW_CLIP = 32635


def _linear_to_ulaw(sample: np.ndarray) -> np.ndarray:
    # ITU-T G.711 µ-law encoding: compress 16-bit linear PCM to 8-bit µ-law.
    # 1. Clamp to ±32635, add bias (0x84) to shift zero away from the log curve.
    # 2. Extract 3-bit exponent from floor(log2(biased)) and 4-bit mantissa.
    # 3. Pack sign | exponent | mantissa into one byte, then invert all bits (µ-law convention).
    sample = sample.astype(np.int32)
    sign = np.where(sample < 0, 0x80, 0).astype(np.uint8)
    sample = np.abs(sample)
    sample = np.clip(sample, 0, _ULAW_CLIP)
    sample += _ULAW_BIAS
    exp = (np.floor(np.log2(sample)).astype(np.int32) - 7).clip(0, 7)
    mantissa = ((sample >> (exp + 3)) & 0x0F).astype(np.uint8)
    return (~(sign | (exp.astype(np.uint8) << 4) | mantissa)).astype(np.uint8)


def _ulaw_to_linear(ulaw: np.ndarray) -> np.ndarray:
    # ITU-T G.711 µ-law decoding: expand 8-bit µ-law to 16-bit linear PCM.
    # 1. Invert all bits (reverse the encoding convention).
    # 2. Extract sign (bit 7), exponent (bits 6-4), and mantissa (bits 3-0).
    # 3. Reconstruct amplitude: ((mantissa << 3) + bias) << exponent, then remove bias.
    # 4. Apply sign to produce signed 16-bit output.
    ulaw = (~ulaw.astype(np.int32)) & 0xFF
    sign = ulaw & 0x80
    exp = (ulaw >> 4) & 0x07
    mantissa = ulaw & 0x0F
    linear = ((mantissa << 3) + _ULAW_BIAS) << exp
    return np.where(sign != 0, _ULAW_BIAS - linear, linear - _ULAW_BIAS).astype(np.int16)


def _resample(samples: np.ndarray, src_rate: int, dst_rate: int) -> np.ndarray:
    if src_rate == dst_rate:
        return samples
    dst_len = int(len(samples) * dst_rate / src_rate)
    if dst_len == 0:
        return np.array([], dtype=np.int16)
    indices = np.linspace(0, len(samples) - 1, dst_len)
    idx_floor = np.floor(indices).astype(np.int64)
    idx_ceil = np.clip(idx_floor + 1, 0, len(samples) - 1)
    frac = (indices - idx_floor).astype(np.float32)
    interp = samples[idx_floor].astype(np.float32) * (1 - frac) + samples[idx_ceil].astype(np.float32) * frac
    return np.clip(interp, -32768, 32767).astype(np.int16)


# ─── Public audio conversion helpers ──────────────────────────────────────────

def ulaw8k_b64_to_pcm16k_bytes(b64: str) -> bytes:
    """Twilio base64 µ-law 8kHz → PCM int16 16kHz bytes."""
    raw = base64.b64decode(b64)
    ulaw = np.frombuffer(raw, dtype=np.uint8)
    return _resample(_ulaw_to_linear(ulaw), 8000, 16000).tobytes()


def pcm24k_bytes_to_ulaw8k_b64(pcm_bytes: bytes) -> str:
    """Gemini PCM int16 24kHz bytes → base64 µ-law 8kHz for Twilio."""
    pcm24k = np.frombuffer(pcm_bytes, dtype=np.int16)
    ulaw = _linear_to_ulaw(_resample(pcm24k, 24000, 8000))
    return base64.b64encode(ulaw.tobytes()).decode("ascii")


# ─── GeminiLiveSession ────────────────────────────────────────────────────────

class GeminiLiveSession:
    """
    Manages a single Gemini Live session via the google-genai SDK.
    One instance per call — not reused across calls.
    Transcription (input + output) is enabled automatically.
    """

    def __init__(
        self,
        system_prompt: str = "",
        voice_name: str = "Kore",
        greeting: str = "Please greet the caller now.",
        api_key: str = "",
        tools: list = [],
        timezone: str = "UTC",
        caller_number: str = "",
    ):
        self.system_prompt = system_prompt
        self.voice_name = voice_name
        self.greeting = greeting
        self.api_key = api_key or GEMINI_API_KEY
        self.tools = tools
        self.timezone = timezone
        self.caller_number = caller_number
        self._session = None
        self._ctx = None
        self.transcript_turns: list[dict] = []

        # Per-turn buffers — flushed to transcript_turns on turnComplete
        self._agent_buf: list[str] = []
        self._caller_buf: list[str] = []

    async def connect(self) -> None:
        """Open the SDK session and send the greeting trigger."""
        client = genai.Client(
            api_key=self.api_key,
            http_options={"api_version": "v1beta"},
        )

        system_instruction = (
            self.system_prompt
            + f"\n\nWhen the call starts, open with exactly this greeting: {self.greeting}"
            + "\n\nIMPORTANT: Respond in whatever language the caller is speaking. "
            "Match their language naturally and switch if they switch."
            + "\n\nIf you couldn't clearly understand what the caller said, politely ask them to repeat."
            + f"\n\nThe caller's current date and time is: {now_in_tz(self.timezone)}. "
            "Always interpret times the caller mentions as being in this timezone, "
            "and express times back to the caller in this timezone."
            + "\n\nWhen you call a tool, briefly acknowledge the caller with a natural filler phrase "
            "('Sure, let me check that for you...', 'One moment...') before the result arrives. "
            "Incorporate the result naturally without mentioning technical details."
            + "\n\nWhen you receive a [tool_name result]: ... message, incorporate it naturally into your response."
        )

        if self.caller_number and self.caller_number not in ("Unknown", "Website Preview"):
            system_instruction += (
                f"\n\nThe caller's phone number is: {self.caller_number}. "
                "Use this for reference when taking messages or scheduling callbacks."
            )

        # Propagate timezone to all tool instances so events are created in the right tz
        for tool in self.tools:
            if hasattr(tool, 'timezone'):
                tool.timezone = self.timezone

        # Append tool prompt contributions
        for tool in self.tools:
            system_instruction += tool.prompt_contribution

        # Build tool declarations for Gemini
        all_declarations = []
        for tool in self.tools:
            for decl in tool.function_declarations:
                all_declarations.append(
                    types.FunctionDeclaration(
                        name=decl["name"],
                        description=decl["description"],
                        parameters=decl.get("parameters"),
                    )
                )

        gemini_tools = []
        if all_declarations:
            gemini_tools = [types.Tool(function_declarations=all_declarations)]

        config = types.LiveConnectConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(
                        voice_name=self.voice_name
                    )
                ),
            ),
            output_audio_transcription=types.AudioTranscriptionConfig(),
            input_audio_transcription=types.AudioTranscriptionConfig(),
            # Faster turn detection: respond quickly after caller stops speaking
            realtime_input_config=types.RealtimeInputConfig(
                automatic_activity_detection=types.AutomaticActivityDetection(
                    start_of_speech_sensitivity=getattr(
                        types.StartSensitivity,
                        f"START_SENSITIVITY_{os.getenv('START_SPEECH_SENSITIVITY', 'HIGH')}",
                    ),
                    end_of_speech_sensitivity=getattr(
                        types.EndSensitivity,
                        f"END_SENSITIVITY_{os.getenv('END_SPEECH_SENSITIVITY', 'LOW')}",
                    ),
                    silence_duration_ms=int(os.getenv("SILENCE_DURATION_MS", "250")),
                ),
                activity_handling=types.ActivityHandling.START_OF_ACTIVITY_INTERRUPTS,
            ),
            system_instruction=system_instruction,
            tools=gemini_tools if gemini_tools else None,
        )

        self._ctx = client.aio.live.connect(model=GEMINI_MODEL, config=config)
        try:
            self._session = await self._ctx.__aenter__()
        except Exception as e:
            logger.error("[Gemini] connect error (model=%s): %r", GEMINI_MODEL, e)
            raise

        # Trigger the agent to speak first
        await self._session.send_realtime_input(text="[call connected]")

    async def send_audio(self, pcm_bytes: bytes) -> None:
        """Send raw PCM int16 16kHz bytes to Gemini."""
        if not self._session:
            raise RuntimeError("Session not connected")
        await self._session.send_realtime_input(
            audio=types.Blob(data=pcm_bytes, mime_type="audio/pcm;rate=16000")
        )

    async def recv_loop(self, callback: Callable[[bytes], None]) -> None:
        """
        Receive loop — calls callback(pcm_bytes) for each audio chunk.
        Also accumulates transcription per turn, flushing on turnComplete.
        Loops continuously because session.receive() only covers one turn at a time.
        """
        if not self._session:
            raise RuntimeError("Session not connected")
        try:
            while True:
                async for response in self._session.receive():
                    # Audio output
                    if response.data:
                        callback(response.data)

                    # Tool call handling
                    if hasattr(response, "tool_call") and response.tool_call:
                        await self._handle_tool_call(response.tool_call)

                    sc = response.server_content
                    if not sc:
                        continue

                    # Agent transcription fragment
                    if sc.output_transcription and sc.output_transcription.text:
                        self._agent_buf.append(sc.output_transcription.text)

                    # Caller transcription fragment
                    if sc.input_transcription and sc.input_transcription.text:
                        self._caller_buf.append(sc.input_transcription.text)

                    # Flush buffers on turn complete
                    if sc.turn_complete:
                        if self._agent_buf:
                            text = "".join(self._agent_buf).strip()
                            if text:
                                self.transcript_turns.append({"role": "agent", "text": text})
                            self._agent_buf = []
                        if self._caller_buf:
                            text = "".join(self._caller_buf).strip()
                            if text:
                                self.transcript_turns.append({"role": "caller", "text": text})
                            self._caller_buf = []

        except Exception as e:
            # WebSocket close frames (1000 normal, 1001 going away, 1008 policy violation)
            # are all expected session-end events from the Gemini Live API — not real errors.
            err_str = str(e)
            is_expected_close = (
                "ConnectionClosed" in type(e).__name__
                or "1000" in err_str
                or "1001" in err_str
                or "1008" in err_str
            )
            if is_expected_close:
                logger.debug("[Gemini] recv_loop session ended: %s", e)
            else:
                logger.error("[Gemini] recv_loop error: %s", e)

    async def _handle_tool_call(self, tool_call) -> None:
        """Acknowledge tool calls immediately, then execute asynchronously."""
        for fc in tool_call.function_calls:
            fn_name = fc.name
            fn_args = dict(fc.args) if fc.args else {}
            matched_tool = next(
                (t for t in self.tools if any(d["name"] == fn_name for d in t.function_declarations)),
                None,
            )
            # Acknowledge immediately so the model keeps talking
            await self._session.send_tool_response(function_responses=[
                types.FunctionResponse(name=fn_name, response={"result": "still_processing"}, id=fc.id)
            ])
            asyncio.create_task(self._run_tool_and_inject(matched_tool, fn_name, fn_args))

    async def _run_tool_and_inject(self, tool, fn_name: str, fn_args: dict) -> None:
        if tool is None:
            result = "Tool not found"
        else:
            try:
                result = await tool.execute(fn_name, fn_args)
            except Exception as e:
                logger.error("[Gemini] tool %s raised: %s", fn_name, e)
                result = f"Tool error: {e}"
        await self._session.send_realtime_input(text=f"[{fn_name} result]: {result}")

    async def close(self) -> None:
        """Close the SDK session."""
        if self._ctx and self._session:
            try:
                await self._ctx.__aexit__(None, None, None)
            except Exception:
                pass
        self._session = None
        self._ctx = None


# ─── Post-call summarization ──────────────────────────────────────────────────

async def summarize_call(
    transcript_turns: list[dict],
    caller_number: str,
    api_key: str = "",
    summary_language: str = "",
) -> str:
    """
    Summarize the call using the Gemini text API.
    Returns a plain-text callback summary.
    If summary_language is set, the summary is written in that language;
    otherwise it matches the conversation language.
    """
    api_key = api_key or GEMINI_API_KEY

    if not transcript_turns:
        return (
            f"Call received from {caller_number}. "
            "No transcript was captured for this call."
        )

    transcript_text = "\n".join(
        f"{'Agent' if t['role'] == 'agent' else 'Caller'}: {t['text']}"
        for t in transcript_turns
    )

    language_instruction = (
        f"Write the summary in {summary_language}."
        if summary_language
        else "Write the summary in the same language as the conversation."
    )

    prompt = (
        f"You received a phone call from {caller_number}.\n\n"
        f"Below is the full transcript of the conversation between the AI receptionist and the caller.\n\n"
        f"Write a concise callback summary that includes:\n"
        f"- What the caller wanted or needed\n"
        f"- Any important details shared (name, date/time requested, topic, complaint, etc.)\n"
        f"- Recommended follow-up action\n\n"
        f"{language_instruction}\n\n"
        f"Transcript:\n{transcript_text}"
    )

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-2.5-flash:generateContent?key={api_key}"
    )
    payload = {"contents": [{"parts": [{"text": prompt}]}]}

    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(url, json=payload)
        r.raise_for_status()
        return r.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
