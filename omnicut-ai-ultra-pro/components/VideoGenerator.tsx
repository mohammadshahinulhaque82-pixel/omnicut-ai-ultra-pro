import React, { useState, useEffect } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";

export default function VideoGenerator() {
  const [tab, setTab] = useState<'dub' | 'video'>('video');
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null);
  const [translationText, setTranslationText] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState('');

  // Clean up object URL on unmount or change
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // Helper to convert file to Base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix (e.g., "data:audio/mp3;base64,")
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const getClient = async () => {
    // Use type assertion to access aistudio to avoid interface merging conflicts
    const aistudio = (window as any).aistudio;
    if (aistudio) {
        const hasKey = await aistudio.hasSelectedApiKey();
        if (!hasKey) {
            aistudio.openSelectKey();
            throw new Error("অনুগ্রহ করে সামনে এগিয়ে যেতে একটি API Key সিলেক্ট করুন।");
        }
    }
    // Safety check for missing API key in static deployment
    const apiKey = process.env.API_KEY || ''; 
    return new GoogleGenAI({ apiKey: apiKey });
  };

  const handleGenerateVideo = async () => {
    if (!prompt) {
      alert("দয়া করে ভিডিওর জন্য একটি প্রম্পট বা বর্ণনা লিখুন।");
      return;
    }

    setIsGenerating(true);
    setStatusMessage("ভিও (Veo) মডেল চালু হচ্ছে...");
    setGeneratedVideoUrl(null);

    try {
      const ai = await getClient();
      setStatusMessage("ভিডিও তৈরি হচ্ছে (একটু সময় লাগতে পারে)...");

      let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: prompt,
        config: {
          numberOfVideos: 1,
          resolution: '720p',
          aspectRatio: '16:9'
        }
      });

      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        setStatusMessage("ভিডিও রেন্ডারিং হচ্ছে...");
        operation = await ai.operations.getVideosOperation({ operation: operation });
      }

      if (operation.response?.generatedVideos?.[0]?.video?.uri) {
        const downloadLink = operation.response.generatedVideos[0].video.uri;
        // Fetch with API key to get the actual blob
        const videoRes = await fetch(`${downloadLink}&key=${process.env.API_KEY || ''}`);
        const blob = await videoRes.blob();
        setGeneratedVideoUrl(URL.createObjectURL(blob));
        setStatusMessage("ভিডিও তৈরি সফল হয়েছে!");
      } else {
        throw new Error("ভিডিও পাওয়া যায়নি।");
      }

    } catch (error: any) {
      console.error(error);
      alert("ভিডিও তৈরিতে সমস্যা হয়েছে: " + (error.message || "অজানা ত্রুটি"));
      setStatusMessage("ব্যর্থ হয়েছে।");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleTranslateAudio = async () => {
    if (!selectedFile) {
      alert("দয়া করে একটি অডিও বা ভিডিও ফাইল আপলোড করুন।");
      return;
    }

    setIsGenerating(true);
    setStatusMessage("ফাইল প্রসেসিং হচ্ছে...");
    setGeneratedAudioUrl(null);
    setTranslationText('');

    try {
      const ai = await getClient();
      const base64Data = await fileToBase64(selectedFile);
      const mimeType = selectedFile.type || 'audio/mp3'; // Fallback

      // Step 1: Transcribe/Translate
      setStatusMessage("কথা বা লিরিক্স ইংরেজিতে অনুবাদ করা হচ্ছে...");
      const translationResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        contents: {
          parts: [
            { inlineData: { mimeType: mimeType, data: base64Data } },
            { text: "Listen to this audio. Translate the spoken lyrics or speech directly into English text. Only output the English translation." }
          ]
        }
      });

      const englishText = translationResponse.text;
      if (!englishText) throw new Error("অনুবাদ করা সম্ভব হয়নি।");
      
      setTranslationText(englishText);
      setStatusMessage("ইংলিশ ডাবিং তৈরি হচ্ছে...");

      // Step 2: Generate Speech (TTS)
      const ttsResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: englishText }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const audioData = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (audioData) {
         // Decode Base64 to Blob for playback
         const binaryString = atob(audioData);
         const len = binaryString.length;
         const bytes = new Uint8Array(len);
         for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
         }
         // Add WAV header
         const wavBlob = addWavHeader(bytes, 24000, 1);
         setGeneratedAudioUrl(URL.createObjectURL(wavBlob));
         setStatusMessage("অনুবাদ সম্পন্ন হয়েছে!");
      } else {
        throw new Error("অডিও তৈরি হয়নি।");
      }

    } catch (error: any) {
      console.error(error);
      alert("অনুবাদে সমস্যা হয়েছে: " + (error.message || "অজানা ত্রুটি"));
      setStatusMessage("ব্যর্থ হয়েছে।");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setGeneratedAudioUrl(null);
      setTranslationText('');
      
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  // Utility to add WAV header
  function addWavHeader(samples: Uint8Array, sampleRate: number, numChannels: number) {
    const buffer = new ArrayBuffer(44 + samples.length);
    const view = new DataView(buffer);
    
    // RIFF identifier
    writeString(view, 0, 'RIFF');
    // RIFF chunk length
    view.setUint32(4, 36 + samples.length, true);
    // RIFF type
    writeString(view, 8, 'WAVE');
    // format chunk identifier
    writeString(view, 12, 'fmt ');
    // format chunk length
    view.setUint32(16, 16, true);
    // sample format (raw)
    view.setUint16(20, 1, true);
    // channel count
    view.setUint16(22, numChannels, true);
    // sample rate
    view.setUint32(24, sampleRate, true);
    // byte rate (sample rate * block align)
    view.setUint32(28, sampleRate * numChannels * 2, true);
    // block align (channel count * bytes per sample)
    view.setUint16(32, numChannels * 2, true);
    // bits per sample
    view.setUint16(34, 16, true);
    // data chunk identifier
    writeString(view, 36, 'data');
    // data chunk length
    view.setUint32(40, samples.length, true);
    
    // write the PCM samples
    const dataView = new Uint8Array(buffer, 44);
    dataView.set(samples);
    
    return new Blob([buffer], { type: 'audio/wav' });
  }

  function writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  return (
    <div className="bg-gradient-to-b from-gray-900 to-black p-8 rounded-[40px] border border-gray-800 shadow-2xl relative overflow-hidden min-h-[600px]">
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 blur-[100px] rounded-full pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-600/10 blur-[100px] rounded-full pointer-events-none"></div>

      <div className="flex bg-gray-950 p-1.5 rounded-2xl mb-8 border border-gray-800 relative z-10">
        <button 
          onClick={() => setTab('video')} 
          className={`flex-1 py-4 rounded-xl font-bold text-sm md:text-base transition-all duration-300 ${tab==='video'?'bg-blue-600 text-white shadow-lg shadow-blue-900/50':'text-gray-400 hover:text-white hover:bg-gray-900'}`}
        >
          এআই ভিডিও মেকার (Veo)
        </button>
        <button 
          onClick={() => setTab('dub')} 
          className={`flex-1 py-4 rounded-xl font-bold text-sm md:text-base transition-all duration-300 ${tab==='dub'?'bg-purple-600 text-white shadow-lg shadow-purple-900/50':'text-gray-400 hover:text-white hover:bg-gray-900'}`}
        >
          গান/ভিডিও ট্রান্সলেটর
        </button>
      </div>
      
      <div className="relative z-10">
        {statusMessage && isGenerating && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-50 rounded-3xl flex flex-col items-center justify-center p-6 text-center animate-fadeIn">
            <svg className="animate-spin h-12 w-12 text-blue-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-xl font-bold text-white">{statusMessage}</p>
            <p className="text-sm text-gray-400 mt-2">অনুগ্রহ করে অপেক্ষা করুন, ট্যাব বন্ধ করবেন না।</p>
          </div>
        )}

        {tab === 'video' ? (
          <div className="space-y-6 animate-fadeIn">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-bold text-white">ভিডিও জেনারেটর</h3>
              <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-1 rounded border border-blue-500/30">Veo 3.1</span>
            </div>
            
            <p className="text-gray-400 text-sm">
              আপনি কেমন ভিডিও চান তা বিস্তারিত লিখুন।
            </p>

            <textarea 
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full bg-gray-900 text-white p-4 rounded-xl border border-gray-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all h-32 resize-none placeholder-gray-600" 
              placeholder="উদাহরণ: একটি সাইবারপাঙ্ক শহর যেখানে বৃষ্টি হচ্ছে, সিনেমাটিক 4K..."
            ></textarea>

            {generatedVideoUrl && (
              <div className="rounded-xl overflow-hidden border border-gray-700 bg-black">
                <video controls className="w-full h-auto" src={generatedVideoUrl} />
                <div className="p-4 bg-gray-900 flex justify-between items-center">
                  <span className="text-green-400 text-sm font-medium">✨ ভিডিও তৈরি সম্পন্ন</span>
                  <a href={generatedVideoUrl} download="veo_generated.mp4" className="text-blue-400 hover:text-white text-sm underline">ডাউনলোড MP4</a>
                </div>
              </div>
            )}

            <button 
              onClick={handleGenerateVideo}
              disabled={isGenerating}
              className={`w-full py-5 rounded-2xl font-black text-xl tracking-wide uppercase transition-all duration-300
                ${isGenerating 
                  ? 'bg-gray-700 cursor-not-allowed text-gray-400' 
                  : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 hover:scale-[1.02] shadow-xl shadow-blue-900/30'
                }`}
            >
              ভিডিও তৈরি করুন
            </button>
          </div>
        ) : (
          <div className="space-y-6 animate-fadeIn">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-bold text-white">ভিডিও/গান ট্রান্সলেটর</h3>
              <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-1 rounded border border-purple-500/30">ভিডিও -> ইংলিশ ডাব</span>
            </div>
            
            <p className="text-gray-400 text-sm">
              আপনার গান বা ভিডিও ফাইল আপলোড করুন। AI কথাগুলো ইংরেজিতে অনুবাদ করে নতুন অডিও তৈরি করবে।
            </p>

            <div className="bg-gray-800/50 p-6 rounded-2xl border border-dashed border-gray-700 hover:border-purple-500 transition-colors group">
              <label className="block w-full cursor-pointer text-center">
                <input type="file" className="hidden" accept="video/*,audio/*" onChange={handleFileChange} />
                <div className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center group-hover:bg-purple-600 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-gray-400 group-hover:text-white">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                    </svg>
                  </div>
                  <span className="text-gray-300 font-medium">
                     {selectedFile ? selectedFile.name : "গান বা ভিডিও আপলোড করুন"}
                  </span>
                  <span className="text-xs text-gray-500">সাপোর্টেড: MP3, WAV, MP4</span>
                </div>
              </label>
            </div>

            {/* Input Preview */}
            {previewUrl && (
              <div className="rounded-xl overflow-hidden border border-gray-700 bg-black mt-4">
                 {/* If video, show video player. If audio, show audio player. */}
                 {selectedFile?.type.startsWith('video') ? (
                    <video src={previewUrl} controls className="w-full h-48 object-contain" />
                 ) : (
                    <div className="p-4 flex justify-center">
                        <audio src={previewUrl} controls className="w-full" />
                    </div>
                 )}
                 <div className="p-2 bg-gray-900/50 text-center text-xs text-gray-500">অরিজিনাল ফাইল</div>
              </div>
            )}

            {translationText && (
               <div className="bg-gray-900 p-4 rounded-xl border border-gray-800">
                  <h4 className="text-gray-400 text-xs uppercase font-bold mb-2">অনুবাদ (English)</h4>
                  <p className="text-gray-200 text-sm italic">"{translationText}"</p>
               </div>
            )}

            {generatedAudioUrl && (
              <div className="rounded-xl p-4 border border-purple-500/30 bg-purple-900/10">
                 <h4 className="text-white font-bold mb-2">ইংলিশ ডাবিং:</h4>
                 <audio controls className="w-full" src={generatedAudioUrl} />
                 {selectedFile?.type.startsWith('video') && (
                    <p className="text-xs text-gray-400 mt-2">
                       * টিপস: উপরের অরিজিনাল ভিডিও মিউট করে এই অডিও প্লে করুন।
                    </p>
                 )}
              </div>
            )}
            
            <button 
              onClick={handleTranslateAudio}
              disabled={isGenerating}
              className={`w-full py-5 rounded-2xl font-black text-xl tracking-wide uppercase transition-all duration-300
                ${isGenerating 
                  ? 'bg-gray-700 cursor-not-allowed text-gray-400' 
                  : 'bg-gradient-to-r from-purple-600 to-purple-800 hover:from-purple-500 hover:to-purple-700 hover:scale-[1.02] shadow-xl shadow-purple-900/30'
                }`}
            >
              ইংরেজিতে ট্রান্সলেট করুন
            </button>
          </div>
        )}
      </div>
    </div>
  );
}