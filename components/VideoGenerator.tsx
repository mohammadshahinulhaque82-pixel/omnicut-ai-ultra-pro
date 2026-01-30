import React, { useState, useEffect } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";

// Helper functions moved outside component to prevent recreation on every render
function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function addWavHeader(samples: Uint8Array, sampleRate: number, numChannels: number) {
  const buffer = new ArrayBuffer(44 + samples.length);
  const view = new DataView(buffer);
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length, true);
  const dataView = new Uint8Array(buffer, 44);
  dataView.set(samples);
  return new Blob([buffer], { type: 'audio/wav' });
}

export default function VideoGenerator() {
  const [tab, setTab] = useState<'dub' | 'video'>('video');
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Audio/Video Dubbing States
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  
  // Video Generation States
  const [prompt, setPrompt] = useState('');
  const [resolution, setResolution] = useState<'720p' | '1080p'>('720p');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [selectedStyle, setSelectedStyle] = useState<string>('Cinematic');
  
  // Video Reference Image State
  const [videoRefImage, setVideoRefImage] = useState<File | null>(null);
  const [videoRefPreview, setVideoRefPreview] = useState<string | null>(null);

  // Outputs
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null);
  const [translationText, setTranslationText] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState('');

  // Style Presets
  const styles = [
    { id: 'Cinematic', label: 'Cinematic', desc: 'Cinematic, high quality, dramatic lighting, movie scene' },
    { id: 'Anime', label: 'Anime', desc: 'Anime style, japanese animation, 2D, vibrant colors' },
    { id: 'Cyberpunk', label: 'Cyberpunk', desc: 'Cyberpunk, neon lights, futuristic, high contrast, sci-fi' },
    { id: 'Vintage', label: 'Vintage', desc: 'Vintage film, grain, retro look, 90s style, VHS effect' },
    { id: '3D Render', label: '3D Render', desc: '3D render, Pixar style, cute, smooth, unreal engine 5' },
    { id: 'Realistic', label: 'Realistic', desc: 'Photorealistic, 8k, highly detailed, nature documentary style' },
  ];

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (generatedVideoUrl) URL.revokeObjectURL(generatedVideoUrl);
      if (generatedAudioUrl) URL.revokeObjectURL(generatedAudioUrl);
      if (videoRefPreview) URL.revokeObjectURL(videoRefPreview);
    };
  }, [previewUrl, generatedVideoUrl, generatedAudioUrl, videoRefPreview]);

  // Helper for better error messages
  const getFriendlyErrorMessage = (error: any) => {
    const msg = (error.message || String(error)).toLowerCase();
    if (msg.includes("api key") || msg.includes("403")) return "API Key সঠিক নয় বা পারমিশন নেই।";
    if (msg.includes("429") || msg.includes("quota")) return "কোটা শেষ হয়ে গেছে, কিছুক্ষণ পর চেষ্টা করুন।";
    if (msg.includes("safety") || msg.includes("blocked")) return "নিরাপত্তা নীতিমালার কারণে কন্টেন্ট তৈরি হয়নি। প্রম্পট পরিবর্তন করুন।";
    if (msg.includes("404")) return "মডেল খুঁজে পাওয়া যায়নি (404)।";
    return "সমস্যা হয়েছে: " + (error.message || "অজানা ত্রুটি");
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const getClient = async () => {
    const aistudio = (window as any).aistudio;
    if (aistudio) {
        const hasKey = await aistudio.hasSelectedApiKey();
        if (!hasKey) {
            aistudio.openSelectKey();
            throw new Error("অনুগ্রহ করে API Key সিলেক্ট করুন।");
        }
    }
    const apiKey = process.env.API_KEY || ''; 
    return new GoogleGenAI({ apiKey: apiKey });
  };

  const handleVideoRefImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setVideoRefImage(file);
      setVideoRefPreview(URL.createObjectURL(file));
    }
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

      // Construct prompt with style
      const styleDesc = styles.find(s => s.id === selectedStyle)?.desc || '';
      const finalPrompt = `${styleDesc}. ${prompt}`;

      // Prepare request parameters
      let requestParams: any = {
        model: 'veo-3.1-fast-generate-preview',
        prompt: finalPrompt,
        config: { 
            numberOfVideos: 1, 
            resolution: resolution, 
            aspectRatio: aspectRatio 
        }
      };

      // Add image if reference exists
      if (videoRefImage) {
        const base64Data = await fileToBase64(videoRefImage);
        requestParams.image = {
            imageBytes: base64Data,
            mimeType: videoRefImage.type || 'image/png'
        };
        setStatusMessage("রেফারেন্স ইমেজ প্রসেস করা হচ্ছে...");
      }

      let operation = await ai.models.generateVideos(requestParams);

      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        setStatusMessage("ভিডিও রেন্ডারিং হচ্ছে...");
        operation = await ai.operations.getVideosOperation({ operation: operation });
      }

      if (operation.response?.generatedVideos?.[0]?.video?.uri) {
        const downloadLink = operation.response.generatedVideos[0].video.uri;
        const apiKey = process.env.API_KEY || '';
        const videoRes = await fetch(`${downloadLink}&key=${apiKey}`);
        if (!videoRes.ok) throw new Error("ভিডিও ডাউনলোড ব্যর্থ।");
        const blob = await videoRes.blob();
        setGeneratedVideoUrl(URL.createObjectURL(blob));
        setStatusMessage("ভিডিও তৈরি সফল হয়েছে!");
      } else {
        throw new Error("ভিডিও পাওয়া যায়নি।");
      }
    } catch (error: any) {
      console.error(error);
      const friendlyMsg = getFriendlyErrorMessage(error);
      alert(friendlyMsg);
      setStatusMessage("ব্যর্থ হয়েছে: " + friendlyMsg);
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
      const mimeType = selectedFile.type || 'audio/mp3'; 

      setStatusMessage("কথা বা লিরিক্স ইংরেজিতে অনুবাদ করা হচ্ছে...");
      const translationResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        contents: {
          parts: [
            { inlineData: { mimeType: mimeType, data: base64Data } },
            { text: "Listen to this audio carefully. Translate any spoken words or lyrics directly into English. Do NOT add any introductory text. Just output the English translation." }
          ]
        }
      });

      const englishText = translationResponse.text;
      if (!englishText) throw new Error("অনুবাদ করা সম্ভব হয়নি।");
      
      setTranslationText(englishText);
      setStatusMessage("ইংলিশ ডাবিং তৈরি হচ্ছে...");

      const ttsResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: englishText }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
        },
      });

      const audioData = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (audioData) {
         const binaryString = atob(audioData);
         const len = binaryString.length;
         const bytes = new Uint8Array(len);
         for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
         const wavBlob = addWavHeader(bytes, 24000, 1);
         setGeneratedAudioUrl(URL.createObjectURL(wavBlob));
         setStatusMessage("অনুবাদ সম্পন্ন হয়েছে!");
      } else {
        throw new Error("অডিও তৈরি হয়নি।");
      }
    } catch (error: any) {
      console.error(error);
      const friendlyMsg = getFriendlyErrorMessage(error);
      alert(friendlyMsg);
      setStatusMessage("ব্যর্থ হয়েছে: " + friendlyMsg);
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

  return (
    <div className="bg-gradient-to-b from-gray-900 to-black p-8 rounded-[40px] border border-gray-800 shadow-2xl relative overflow-hidden min-h-[600px]">
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
            
            {/* Configuration Options */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700">
                    <label className="text-gray-400 text-xs uppercase font-bold mb-2 block">রেজোলিউশন</label>
                    <div className="flex gap-2">
                        <button 
                            onClick={() => setResolution('720p')}
                            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${resolution === '720p' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                        >
                            720p (HD)
                        </button>
                        <button 
                            onClick={() => setResolution('1080p')}
                            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${resolution === '1080p' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                        >
                            1080p (FHD)
                        </button>
                    </div>
                </div>

                <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700">
                    <label className="text-gray-400 text-xs uppercase font-bold mb-2 block">অ্যাসপেক্ট রেশিও</label>
                    <div className="flex gap-2">
                        <button 
                            onClick={() => setAspectRatio('16:9')}
                            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${aspectRatio === '16:9' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                        >
                            16:9 (TV/Youtube)
                        </button>
                        <button 
                            onClick={() => setAspectRatio('9:16')}
                            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${aspectRatio === '9:16' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                        >
                            9:16 (Shorts/Reels)
                        </button>
                    </div>
                </div>
            </div>

            {/* Style Selector */}
            <div className="space-y-2">
                <label className="text-gray-400 text-xs uppercase font-bold">ভিডিও স্টাইল</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {styles.map((style) => (
                        <button
                            key={style.id}
                            onClick={() => setSelectedStyle(style.id)}
                            className={`p-3 rounded-xl border text-left transition-all duration-200 relative overflow-hidden group ${
                                selectedStyle === style.id 
                                ? 'bg-blue-900/40 border-blue-500 text-white' 
                                : 'bg-gray-800/50 border-gray-700 text-gray-400 hover:border-gray-500 hover:bg-gray-800'
                            }`}
                        >
                            <span className="relative z-10 text-sm font-bold block">{style.label}</span>
                            {selectedStyle === style.id && <div className="absolute inset-0 bg-blue-500/10"></div>}
                        </button>
                    ))}
                </div>
            </div>

            {/* Style Reference Image Upload */}
            <div className="bg-gray-800/30 p-4 rounded-xl border border-dashed border-gray-700 hover:border-blue-500 transition-colors group">
                <label className="flex items-center gap-4 cursor-pointer w-full">
                    <div className="w-16 h-16 bg-gray-900 rounded-lg flex items-center justify-center text-gray-500 border border-gray-700 overflow-hidden relative">
                        {videoRefPreview ? (
                            <img src={videoRefPreview} className="w-full h-full object-cover" alt="Reference" />
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                            </svg>
                        )}
                    </div>
                    <div className="flex-1">
                        <span className="block text-sm font-bold text-gray-300 group-hover:text-blue-400 transition-colors">
                           {videoRefImage ? "ইমেজ সিলেক্ট করা হয়েছে" : "স্টাইল রেফারেন্স ইমেজ আপলোড করুন (অপশনাল)"}
                        </span>
                        <span className="text-xs text-gray-500">
                            {videoRefImage ? videoRefImage.name : "ভিডিওর স্টাইল এই ছবির মত হবে"}
                        </span>
                    </div>
                    <input type="file" className="hidden" accept="image/*" onChange={handleVideoRefImageChange} />
                    {videoRefImage && (
                        <button 
                            onClick={(e) => {
                                e.preventDefault();
                                setVideoRefImage(null);
                                setVideoRefPreview(null);
                            }}
                            className="p-2 hover:bg-red-500/20 rounded-full text-gray-500 hover:text-red-500"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </label>
            </div>

            <p className="text-gray-400 text-sm">
              আপনি কেমন ভিডিও চান তা বিস্তারিত লিখুন।
            </p>

            <textarea 
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full bg-gray-900 text-white p-4 rounded-xl border border-gray-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all h-24 resize-none placeholder-gray-600" 
              placeholder="উদাহরণ: একটি সাইবারপাঙ্ক শহর যেখানে বৃষ্টি হচ্ছে..."
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

            {/* UNLIMITED UPLOAD UI */}
            <div className="bg-gray-800/50 p-8 rounded-3xl border-2 border-dashed border-gray-700 hover:border-purple-500 transition-all duration-300 group relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                
                <label className="block w-full cursor-pointer text-center relative z-10">
                <input type="file" className="hidden" accept="video/*,audio/*" onChange={handleFileChange} />
                
                <div className="flex flex-col items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-gray-800 shadow-xl shadow-black/50 flex items-center justify-center group-hover:bg-purple-600 group-hover:scale-110 transition-all duration-300">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-purple-400 group-hover:text-white">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                    </div>

                    <div>
                    <span className="text-xl font-bold text-white block mb-1">
                        {selectedFile ? selectedFile.name : "ভিডিও বা অডিও আপলোড করুন"}
                    </span>
                    <span className="text-sm text-purple-300 bg-purple-500/10 px-3 py-1 rounded-full border border-purple-500/20 inline-block mt-2 font-bold tracking-wide">
                        🚀 আনলিমিটেড আপলোড সাপোর্ট
                    </span>
                    </div>
                    
                    <p className="text-xs text-gray-500 mt-2 max-w-xs mx-auto">
                    যেকোনো সাইজের MP4, MP3, WAV ফাইল। হাই-স্পিড AI প্রসেসিং।
                    </p>
                </div>
                </label>
            </div>

            {/* Input Preview */}
            {previewUrl && (
              <div className="rounded-xl overflow-hidden border border-gray-700 bg-black mt-4 relative group">
                 {selectedFile?.type.startsWith('video') ? (
                    <video src={previewUrl} controls className="w-full h-48 object-contain" />
                 ) : (
                    <div className="p-4 flex justify-center">
                        <audio src={previewUrl} controls className="w-full" />
                    </div>
                 )}
                 <div className="p-2 bg-gray-900/50 text-center text-xs text-gray-500">অরিজিনাল ফাইল</div>
                 <button 
                    onClick={() => {
                        setSelectedFile(null);
                        setPreviewUrl(null);
                        setTranslationText('');
                        setGeneratedAudioUrl(null);
                    }}
                    className="absolute top-2 right-2 bg-red-600 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                 >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                 </button>
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