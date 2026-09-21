/**
 * Speech Recognition and Audio Assist Utilities
 * Specially designed for vision-impaired salesmen and retail billing operators.
 */

// Check if browser supports Web Speech Recognition
export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
}

// Speak assistive speech announcements for vision-impaired users
export function speakAssistiveText(text: string): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel(); // Stop any pending speech
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.pitch = 1.0;
    utterance.lang = 'en-IN'; // Indian English accent preferred for FMCG retail names
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('Speech synthesis error:', err);
  }
}

export interface SpeechSessionOptions {
  onResult: (transcript: string) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
  onStart?: () => void;
  lang?: string;
}

export interface ActiveSpeechSession {
  stop: () => void;
  abort: () => void;
}

export function startSpeechRecognition(options: SpeechSessionOptions): ActiveSpeechSession | null {
  if (typeof window === 'undefined') return null;

  const SpeechRecognitionClass =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  if (!SpeechRecognitionClass) {
    if (options.onError) {
      options.onError('Speech recognition is not supported in this browser.');
    }
    return null;
  }

  try {
    const recognition = new SpeechRecognitionClass();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.lang = options.lang || 'en-IN';

    recognition.onstart = () => {
      if (options.onStart) options.onStart();
    };

    recognition.onresult = (event: any) => {
      const results = event.results;
      if (results && results.length > 0) {
        const transcript = results[0][0]?.transcript || '';
        if (transcript.trim()) {
          options.onResult(transcript.trim());
        }
      }
    };

    recognition.onerror = (event: any) => {
      const errType = event.error || 'Speech recognition error';
      if (options.onError) {
        options.onError(errType);
      }
    };

    recognition.onend = () => {
      if (options.onEnd) options.onEnd();
    };

    recognition.start();

    return {
      stop: () => {
        try {
          recognition.stop();
        } catch (_) {}
      },
      abort: () => {
        try {
          recognition.abort();
        } catch (_) {}
      },
    };
  } catch (e: any) {
    if (options.onError) {
      options.onError(e.message || 'Unable to start microphone.');
    }
    return null;
  }
}
