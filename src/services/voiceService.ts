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
        // Cancel any currently playing speech
        this.stop();

        const utterance = new SpeechSynthesisUtterance(text);
        const voice = this.getBestVoice();
        if (voice) {
          utterance.voice = voice;
        }

        // Natural, clear pacing suitable for seniors & daily advisories
        utterance.rate = 0.92;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        utterance.onstart = () => {
          this.isSpeaking = true;
          this.hasSpoken = true;
          this.notify();
        };

        const finish = () => {
          this.isSpeaking = false;
          this.clearUtterance();
          this.notify();
          if (onEnd) onEnd();
          resolve(true);
        };

        utterance.onend = finish;
        utterance.onerror = (event) => {
          console.warn('[VoiceService] Speech synthesis event:', event);
          this.isSpeaking = false;
          this.clearUtterance();
          this.notify();
          resolve(false);
        };

        this.retainUtterance(utterance);

        // Resume in case speech synthesis was paused by browser
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }

        window.speechSynthesis.speak(utterance);

        // Workaround for Chrome bug where speech can pause after 15s or need a kick
        setTimeout(() => {
          if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
          }
        }, 100);
      } catch (err) {
        console.error('[VoiceService] speak error:', err);
        this.isSpeaking = false;
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

    if (!this.hasSpoken) {
      // Attempt speak immediately (will work if browser permits autoplay)
      this.speak(script).then((success) => {
        if (!success) {
          // If browser blocked autoplay, pendingForecastText remains ready for the first click/tap
          this.pendingForecastText = script;
        }
      });
    }
  }
}

export const voiceService = new VoiceService();
