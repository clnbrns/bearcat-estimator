import React, { useEffect, useRef, useState } from 'react';
import { parseVoiceIntake } from '../lib/api.js';

// Browser SpeechRecognition (free, runs locally; falls back gracefully if unsupported)
const SpeechRecognition = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;

export default function VoiceIntake({ onParsed }) {
  const [supported] = useState(!!SpeechRecognition);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState(null);
  const [parsed, setParsed] = useState(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    if (!SpeechRecognition) return;
    const r = new SpeechRecognition();
    r.continuous = true;
    r.interimResults = true;
    r.lang = 'en-US';
    r.onresult = (e) => {
      let final = '';
      let interimStr = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t + ' ';
        else interimStr += t;
      }
      if (final) setTranscript(prev => (prev + ' ' + final).trim());
      setInterim(interimStr);
    };
    r.onerror = (e) => setError(`Mic error: ${e.error}`);
    r.onend = () => setListening(false);
    recognitionRef.current = r;
    return () => r.abort();
  }, []);

  const start = () => {
    setError(null);
    setTranscript('');
    setInterim('');
    setParsed(null);
    try {
      recognitionRef.current.start();
      setListening(true);
    } catch (e) {
      setError(e.message);
    }
  };

  const stop = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  const submit = async () => {
    const text = (transcript + ' ' + interim).trim();
    if (text.length < 5) { setError('Say a bit more first.'); return; }
    setParsing(true);
    setError(null);
    try {
      const result = await parseVoiceIntake(text);
      setParsed(result);
      onParsed(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setParsing(false);
    }
  };

  if (!supported) return (
    <div className="border-2 border-dashed border-sageMuted rounded p-3 bg-sageMuted/10 text-sm text-hunter/60">
      🎤 Voice intake not supported in this browser. Use Chrome, Edge, or Safari.
    </div>
  );

  return (
    <div className="border-2 border-dashed border-sage rounded p-4 bg-sageMuted/10">
      <div className="flex items-center justify-between mb-2">
        <div className="font-medium text-hunter">🎤 Voice Intake</div>
        <div className="text-xs text-hunter/60">
          {listening ? '● Listening…' : 'Tap to dictate the job'}
        </div>
      </div>
      <div className="text-xs text-hunter/60 mb-3">
        Walk the yard, hit Start, describe the job out loud (customer name, address, dimensions, project type, scope). We'll auto-fill the form.
      </div>

      <div className="flex gap-2 mb-3">
        {!listening ? (
          <button type="button" onClick={start}
            className="bg-burnt text-white px-4 py-2 rounded font-semibold flex items-center gap-2">
            🎙 Start
          </button>
        ) : (
          <button type="button" onClick={stop}
            className="bg-burnt text-white px-4 py-2 rounded font-semibold flex items-center gap-2 animate-pulse">
            ⏹ Stop
          </button>
        )}
        <button type="button" onClick={submit} disabled={!transcript || parsing}
          className="bg-sage text-hunter px-4 py-2 rounded font-semibold disabled:opacity-40">
          {parsing ? 'Parsing…' : 'Use This →'}
        </button>
        {transcript && (
          <button type="button" onClick={() => { setTranscript(''); setInterim(''); setParsed(null); }}
            className="text-hunter/60 underline px-2 text-sm">Clear</button>
        )}
      </div>

      {(transcript || interim) && (
        <div className="bg-white border border-sageMuted rounded p-3 text-sm text-hunter min-h-[60px]">
          {transcript}
          {interim && <span className="text-hunter/40 italic"> {interim}</span>}
        </div>
      )}

      {parsed && (
        <div className="mt-3 bg-white border border-sage rounded p-3 text-sm">
          <div className="font-medium text-hunter mb-1">✓ Extracted (confidence: {parsed.confidence || 'medium'})</div>
          <div className="text-xs text-hunter/70">
            {parsed.customer_name && <>{parsed.customer_name} · </>}
            {parsed.total_sf > 0 && <>{parsed.total_sf} SF · </>}
            {parsed.project_type}
            {parsed.product_name && <> · {parsed.product_name}</>}
          </div>
          {parsed._raw_understanding && (
            <div className="text-xs italic text-hunter/50 mt-1">"{parsed._raw_understanding}"</div>
          )}
          <div className="text-xs text-hunter/50 mt-1">Form filled. Review &amp; adjust below.</div>
        </div>
      )}

      {error && <div className="mt-2 text-sm text-burnt">⚠ {error}</div>}
    </div>
  );
}
