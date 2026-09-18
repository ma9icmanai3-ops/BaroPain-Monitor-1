// Voice capability service using Web Speech API with autoplay unlock and natural pacing
import { WeatherMetrics, PainScores } from '../types';

export type VoiceStateListener = (isSpeaking: boolean) => void;

class VoiceService {
  private listeners: Set<VoiceStateListener> = new Set();
  private isSpeaking = false;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private pendingForecastText: string | null = null;
  private hasSpoken = false;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      // Chrome/Safari voice loading
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = () => {
          // Warm up voice list
          window.speechSynthesis.getVoices();
        };
      }

      // Add a one-time interaction listener to unlock audio if autoplay was blocked
      const unlockAudio = () => {
        try {
          // Warm up speech synthesis context
          window.speechSynthesis.getVoices();
        } catch {}
        if (this.pendingForecastText && !this.hasSpoken && !this.isSpeaking) {
          this.speak(this.pendingForecastText);
          this.pendingForecastText = null;
        }
        window.removeEventListener('click', unlockAudio);
        window.removeEventListener('keydown', unlockAudio);
        window.removeEventListener('touchstart', unlockAudio);
      };

      window.addEventListener('click', unlockAudio, { passive: true });
      window.addEventListener('keydown', unlockAudio, { passive: true });
      window.addEventListener('touchstart', unlockAudio, { passive: true });
    }
  }

  // Play a soft auditory chime indicating the voice engine is activated
  private playActivationChime() {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.26);
    } catch {}
  }

  public isSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  public subscribe(listener: VoiceStateListener): () => void {
    this.listeners.add(listener);
    listener(this.isSpeaking);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((listener) => listener(this.isSpeaking));
  }

  // Retain utterance globally to avoid Chrome garbage collection cancellation bug
  private retainUtterance(u: SpeechSynthesisUtterance) {
    this.currentUtterance = u;
    (window as any).__currentUtterance = u;
  }

  private clearUtterance() {
    this.currentUtterance = null;
    (window as any).__currentUtterance = null;
  }

  private getBestVoice(): SpeechSynthesisVoice | null {
    if (!this.isSupported()) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;

    // Prefer clear, warm English voices
    const preferred = voices.find(
      (v) =>
        v.lang.startsWith('en') &&
        (v.name.includes('Natural') ||
          v.name.includes('Google') ||
          v.name.includes('Samantha') ||
          v.name.includes('Daniel') ||
          v.name.includes('Karen') ||
          v.name.includes('Serena'))
    );

    return preferred || voices.find((v) => v.lang.startsWith('en')) || voices[0] || null;
  }

  public stop() {
    if (!this.isSupported()) return;
    try {
      window.speechSynthesis.cancel();
    } catch {}
    this.isSpeaking = false;
    this.clearUtterance();
    this.notify();
  }

  public speak(text: string, onEnd?: () => void): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.isSupported() || !text.trim()) {
        resolve(false);
        return;
      }

      try {
        // Play gentle audio chime to confirm sound output is working immediately on user click
        this.playActivationChime();

        // 1. Cancel previous speech
        try {
          window.speechSynthesis.cancel();
        } catch {}
        this.clearUtterance();

        // Clean text of non-standard symbols or special dashes
        const cleanText = text
          .replace(/[•–—]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        // Break text into digestible sentences
        const sentences = cleanText
          .split(/(?<=[.?!])\s+/)
          .map((s) => s.trim())
          .filter(Boolean);

        if (sentences.length === 0) {
          resolve(false);
          return;
        }

        let currentIndex = 0;
        this.isSpeaking = true;
        this.hasSpoken = true;
        this.notify();

        let resumeTimer: any = null;

        const cleanup = (success: boolean) => {
          if (resumeTimer) clearInterval(resumeTimer);
          this.isSpeaking = false;
          this.clearUtterance();
          this.notify();
          if (onEnd) onEnd();
          resolve(success);
        };

        const speakNextSentence = () => {
          if (!this.isSpeaking || currentIndex >= sentences.length) {
            cleanup(true);
            return;
          }

          const sentence = sentences[currentIndex];
          currentIndex++;

          const utterance = new SpeechSynthesisUtterance(sentence);
          const voices = window.speechSynthesis.getVoices();
          const voice = this.getBestVoice();

          if (voice) {
            utterance.voice = voice;
          } else if (voices && voices.length > 0) {
            const enVoice = voices.find((v) => v.lang.toLowerCase().startsWith('en')) || voices[0];
            utterance.voice = enVoice;
          }

          utterance.rate = 0.95;
          utterance.pitch = 1.0;
          utterance.volume = 1.0;

          utterance.onend = () => {
            if (this.isSpeaking) {
              setTimeout(speakNextSentence, 80);
            }
          };

          utterance.onerror = (event: any) => {
            const errType = event?.error || 'error';
            console.warn('[VoiceService] Speech error:', errType);
            if (errType === 'canceled' || errType === 'interrupted') {
              cleanup(false);
              return;
            }
            // If one sentence fails in the webview, attempt the next sentence
            if (this.isSpeaking) {
              setTimeout(speakNextSentence, 80);
            }
          };

          this.retainUtterance(utterance);

          if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
          }

          try {
            window.speechSynthesis.speak(utterance);
          } catch (speakErr) {
            console.error('[VoiceService] speak error:', speakErr);
            cleanup(false);
          }
        };

        // Important: in Chromium/Safari, calling speak() immediately (<100ms) after cancel()
        // causes the browser to instantly fire SpeechSynthesisErrorEvent with error: "canceled".
        // A 180ms delay guarantees the cancel cycle finishes before queuing the new utterance.
        setTimeout(() => {
          if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
          }
          speakNextSentence();

          resumeTimer = setInterval(() => {
            if (!this.isSpeaking) {
              clearInterval(resumeTimer);
              return;
            }
            if (window.speechSynthesis.paused) {
              window.speechSynthesis.resume();
            }
          }, 1500);
        }, 180);
      } catch (err) {
        console.error('[VoiceService] speak error:', err);
        this.isSpeaking = false;
        this.clearUtterance();
        this.notify();
        resolve(false);
      }
    });
  }

  // Generate friendly spoken script for today's forecast
  public generateForecastText(
    locationName: string,
    weather: WeatherMetrics,
    painScores?: PainScores | null
  ): string {
    const todayForecast = weather.forecastDays && weather.forecastDays.length > 0 ? weather.forecastDays[0] : null;

    const acheScore = todayForecast
      ? todayForecast.predictedPainScore
      : painScores
      ? Math.max(1, Math.min(10, Math.round(painScores.overallRisk / 10)))
      : 3;

    let headline = todayForecast?.painHeadline || (acheScore >= 7 ? 'High Ache Alert' : acheScore >= 4 ? 'Moderate Aches Possible' : 'Good Day for Your Joints');
    let advice = todayForecast?.advice || (acheScore >= 7 ? 'A storm or rapid pressure drop is in effect. Stay warm, relax, and keep a heating pad or warm tea handy.' : acheScore >= 4 ? 'The air pressure is shifting today. Gentle stretching and warm clothing will help you stay comfortable.' : 'The air pressure is calm and steady. Most people feel comfortable on days like this.');

    let cleanTrend = weather.pressureTrend
      ? weather.pressureTrend.toLowerCase().replace(/[^\w\s]/g, '').trim()
      : 'steady';

    let speech = `Hello! Here is today's weather and joint pain forecast for ${locationName}. `;
    speech += `Overall status: ${headline}, with an ache level of ${acheScore} out of 10. `;
    speech += `The current temperature is ${weather.temperature}, with ${weather.humidity} humidity. `;
    speech += `Barometric pressure is ${weather.currentPressureInHg.toFixed(2)} inches of mercury, and is ${cleanTrend}. `;
    speech += `Today's advice: ${advice} `;

    // Mention tomorrow if forecast is available
    if (weather.forecastDays && weather.forecastDays.length > 1) {
      const tomorrow = weather.forecastDays[1];
      speech += `Looking ahead to tomorrow, ${tomorrow.dayLabel}: ache risk is predicted to be ${tomorrow.predictedRiskLevel}, with a high near ${Math.round(tomorrow.tempMax)} degrees. `;
    }

    speech += `Stay warm, comfortable, and have a wonderful day!`;
    return speech;
  }

  // Called on load to queue or attempt reading
  public readForecastOnLoad(
    locationName: string,
    weather: WeatherMetrics,
    painScores?: PainScores | null
  ) {
    const script = this.generateForecastText(locationName, weather, painScores);
    this.pendingForecastText = script;

    // Do NOT automatically trigger speech on load without user gesture, because
    // modern browsers (Chrome, Edge, Safari, Roblox WebViews, iframes) block audio autoplay.
    // When autoplay is blocked, the browser puts SpeechSynthesis into a frozen 'speaking' state
    // where UI buttons show "Speaking" / "Stop Voice" while no audio actually plays!
    // Instead, pendingForecastText stays ready so the user's first click immediately speaks aloud.
  }
}

export const voiceService = new VoiceService();
