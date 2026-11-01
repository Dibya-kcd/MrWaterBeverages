/**
 * Speech Recognition and Audio Assist Utilities
 * Specially designed for vision-impaired salesmen and retail billing operators.
 * Fully compatible with Android Webview/APK, mobile Chrome, and desktop browsers.
 */

// Track whether speech recognition is actively listening to prevent TTS feedback loop
let isListeningActive = false;

// Check if browser supports Web Speech Recognition
export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
}

// Cancel any active speech synthesis immediately
export function cancelAssistiveText(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
  } catch (err) {
    console.warn('Error cancelling speech synthesis:', err);
  }
}

// Speak assistive speech announcements for vision-impaired users
export function speakAssistiveText(text: string, force = false): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  // If microphone is currently listening, do NOT speak unless forced, to avoid interfering with mic input
  if (isListeningActive && !force) {
    return;
  }
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
  onInterimResult?: (interimTranscript: string) => void;
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

  // Immediately cancel any text-to-speech so it doesn't feed into microphone
  cancelAssistiveText();

  const SpeechRecognitionClass =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  if (!SpeechRecognitionClass) {
    if (options.onError) {
      options.onError('Voice recognition is not supported on this browser/device.');
    }
    return null;
  }

  try {
    const recognition = new SpeechRecognitionClass();
    recognition.continuous = false;
    recognition.interimResults = true; // Enable live transcript preview
    recognition.maxAlternatives = 1;
    recognition.lang = options.lang || 'en-IN';

    let hasEnded = false;
    let finalTranscriptReceived = '';

    const cleanup = () => {
      isListeningActive = false;
      if (!hasEnded) {
        hasEnded = true;
        if (options.onEnd) options.onEnd();
      }
    };

    recognition.onstart = () => {
      isListeningActive = true;
      // Ensure any lingering speech is stopped
      cancelAssistiveText();
      if (options.onStart) options.onStart();
    };

    recognition.onresult = (event: any) => {
      const results = event.results;
      if (!results) return;

      let interim = '';
      for (let i = event.resultIndex; i < results.length; i++) {
        const transcriptPart = results[i][0]?.transcript || '';
        if (results[i].isFinal) {
          finalTranscriptReceived += transcriptPart;
        } else {
          interim += transcriptPart;
        }
      }

      if (interim && options.onInterimResult) {
        options.onInterimResult(interim.trim());
      }

      const completed = (finalTranscriptReceived || interim).trim();
      if (completed && results[results.length - 1]?.isFinal) {
        options.onResult(completed);
      }
    };

    recognition.onerror = (event: any) => {
      const errType = event.error || 'Speech recognition error';
      isListeningActive = false;
      
      let userFriendlyError = 'Microphone error.';
      if (errType === 'not-allowed' || errType === 'permission-denied') {
        userFriendlyError = 'Microphone permission denied. Please allow microphone in settings.';
      } else if (errType === 'no-speech') {
        userFriendlyError = 'No speech detected. Please speak clearly into the microphone.';
      } else if (errType === 'audio-capture') {
        userFriendlyError = 'No microphone device found on this system.';
      } else if (errType === 'network') {
        userFriendlyError = 'Network error during voice recognition.';
      } else if (errType === 'aborted') {
        // Normal abort, don't show scary error
        return;
      }

      if (options.onError) {
        options.onError(userFriendlyError);
      }
    };

    recognition.onend = () => {
      cleanup();
    };

    // Auto timeout fallback for mobile browsers that fail to trigger onend
    const safetyTimeout = setTimeout(() => {
      if (isListeningActive) {
        try {
          recognition.stop();
        } catch (_) {}
      }
    }, 12000);

    recognition.start();

    return {
      stop: () => {
        clearTimeout(safetyTimeout);
        isListeningActive = false;
        try {
          recognition.stop();
        } catch (_) {}
      },
      abort: () => {
        clearTimeout(safetyTimeout);
        isListeningActive = false;
        try {
          recognition.abort();
        } catch (_) {}
      },
    };
  } catch (e: any) {
    isListeningActive = false;
    if (options.onError) {
      options.onError(e.message || 'Unable to start microphone.');
    }
    return null;
  }
}

/**
 * Parses spoken input for beverage search and quantities.
 * Examples:
 * - "5 Apple Fizz" -> { quantity: 5, query: "Apple Fizz" }
 * - "Ten Jeera Masala" -> { quantity: 10, query: "Jeera Masala" }
 * - "Dozen mango juice" -> { quantity: 12, query: "mango juice" }
 * - "Half dozen cola" -> { quantity: 6, query: "cola" }
 * - "Two dozen sprite" -> { quantity: 24, query: "sprite" }
 * - "Please add 4 cases of fizz" -> { quantity: 4, query: "fizz" }
 * - "Give me 2 boxes lemonade" -> { quantity: 2, query: "lemonade" }
 */
export interface SpokenOrderParsed {
  quantity: number;
  query: string;
  hasExplicitQuantity: boolean;
  raw: string;
}

const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
  dozen: 12,
  'half dozen': 6,
  'two dozen': 24,
  'three dozen': 36,
};

export function parseSpokenQuantityAndProduct(transcript: string): SpokenOrderParsed {
  const raw = transcript.trim();
  if (!raw) {
    return { quantity: 1, query: '', hasExplicitQuantity: false, raw: '' };
  }

  let lower = raw.toLowerCase().trim();

  // Strip conversational filler prefixes
  lower = lower
    .replace(/^(please\s+add\s+|add\s+|give\s+me\s+|give\s+|put\s+|i\s+want\s+|take\s+)/i, '')
    .trim();

  let detectedQty = 1;
  let hasExplicit = false;

  // Check special compound words like "half dozen" or "two dozen"
  if (lower.startsWith('half dozen')) {
    detectedQty = 6;
    hasExplicit = true;
    lower = lower.replace(/^half dozen\s*(of\s*)?/, '').trim();
  } else if (lower.startsWith('two dozen')) {
    detectedQty = 24;
    hasExplicit = true;
    lower = lower.replace(/^two dozen\s*(of\s*)?/, '').trim();
  } else if (lower.startsWith('three dozen')) {
    detectedQty = 36;
    hasExplicit = true;
    lower = lower.replace(/^three dozen\s*(of\s*)?/, '').trim();
  } else if (lower.startsWith('dozen')) {
    detectedQty = 12;
    hasExplicit = true;
    lower = lower.replace(/^dozen\s*(of\s*)?/, '').trim();
  } else {
    // Check digits at start, e.g. "5 apple fizz", "12 cola"
    const digitMatch = lower.match(/^(\d+)\s*(cases?|cs|boxes?|crates?|bottles?|packets?|pcs|pieces?)?\s*(of\s*)?/i);
    if (digitMatch && digitMatch[1]) {
      const parsedNum = parseInt(digitMatch[1], 10);
      if (!isNaN(parsedNum) && parsedNum > 0) {
        detectedQty = parsedNum;
        hasExplicit = true;
        lower = lower.slice(digitMatch[0].length).trim();
      }
    } else {
      // Check word numbers at start, e.g. "five apple fizz", "ten mango"
      const tokens = lower.split(/\s+/);
      const firstToken = tokens[0];
      if (NUMBER_WORDS[firstToken] !== undefined) {
        detectedQty = NUMBER_WORDS[firstToken];
        hasExplicit = true;
        tokens.shift();
        // Remove trailing unit words if present: "cases", "case", "crates", "bottles", "of"
        if (tokens.length > 0 && /^(cases?|cs|boxes?|crates?|bottles?|packets?|pcs|pieces?)$/i.test(tokens[0])) {
          tokens.shift();
        }
        if (tokens.length > 0 && tokens[0].toLowerCase() === 'of') {
          tokens.shift();
        }
        lower = tokens.join(' ').trim();
      }
    }
  }

  // Remove any remaining unit or filler noise from product query
  const cleanQuery = lower
    .replace(/\b(cases?|crates?|boxes?|bottles?|pack|packs)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    quantity: detectedQty,
    query: cleanQuery || raw,
    hasExplicitQuantity: hasExplicit,
    raw,
  };
}
