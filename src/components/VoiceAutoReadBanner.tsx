import React from 'react';
import { Volume2, VolumeX, Sparkles, X } from 'lucide-react';

interface VoiceAutoReadBannerProps {
  isSpeaking: boolean;
  onPlayForecast: () => void;
  onStopForecast: () => void;
  locationName: string;
}

export const VoiceAutoReadBanner: React.FC<VoiceAutoReadBannerProps> = ({
  isSpeaking,
  onPlayForecast,
  onStopForecast,
  locationName,
}) => {
  return (
    <div
      id="voice-autoread-banner"
      className="mb-6 rounded-2xl p-4 sm:p-5 border-2 shadow-sm transition-all flex flex-col sm:flex-row items-center justify-between gap-4 bg-gradient-to-r from-emerald-50 via-teal-50 to-sky-50 border-emerald-300"
    >
      <div className="flex items-center gap-3.5 w-full sm:w-auto">
        <div
          className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${
            isSpeaking
              ? 'bg-amber-500 text-white ring-4 ring-amber-200 animate-pulse'
              : 'bg-emerald-600 text-white'
          }`}
        >
          {isSpeaking ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-600/10 text-emerald-800 uppercase tracking-wider">
              <Sparkles className="w-3 h-3 text-emerald-600" />
              Voice Capability Active
            </span>
            <span className="text-xs font-semibold text-slate-500">{locationName}</span>
          </div>
          <p className="text-sm sm:text-base font-bold text-slate-900 mt-1">
            {isSpeaking ? (
              <span className="text-amber-800 animate-pulse">
                🎙️ Reading today's joint pain and barometer forecast out loud...
              </span>
            ) : (
              <span>
                Want to listen? Tap to hear today's weather & arthritis forecast read aloud.
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="w-full sm:w-auto shrink-0 flex items-center gap-2">
        {isSpeaking ? (
          <button
            id="btn-banner-stop-voice"
            onClick={onStopForecast}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm shadow-sm transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <VolumeX className="w-4 h-4" />
            <span>Stop Reading</span>
          </button>
        ) : (
          <button
            id="btn-banner-play-voice"
            onClick={onPlayForecast}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-sm transition flex items-center justify-center gap-2 cursor-pointer active:scale-95"
          >
            <Volume2 className="w-5 h-5" />
            <span>🔊 Talk Daily Forecast</span>
          </button>
        )}
      </div>
    </div>
  );
};
