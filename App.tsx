import React from 'react';
// Explicitly import with .tsx extension for Babel Standalone
import VideoGenerator from './components/VideoGenerator.tsx';

export default function App() {
  const features = [
    "বেসিক এডিটিং", "সোশ্যাল মিডিয়া প্রো", "সিনেমাটিক ইফেক্টস", 
    "মোশন গ্রাফিক্স", "এআই ভিডিও মাস্টার", "ফেস এবং ভয়েস সোয়াপ",
    "গ্রিন স্ক্রিন স্টুডিও", "ভাইরাল বিট সিঙ্ক", "ইউটিউব সুট",
    "বিজনেস অ্যাড মেকার", "গেমিং মন্টেজ", "2D/3D অ্যানিমেশন",
    "কপিরাইট বাইপাস", "HDR এক্সপোর্ট", "প্রো ফ্যাশন সোয়াপ"
  ];

  return (
    <div className="min-h-screen bg-black text-white p-6 font-sans selection:bg-blue-500 selection:text-white">
      <header className="flex flex-col md:flex-row justify-between items-center border-b border-gray-800 pb-6 mb-8 gap-4">
        <h1 className="text-3xl md:text-4xl font-black bg-gradient-to-r from-blue-400 via-purple-500 to-pink-600 bg-clip-text text-transparent tracking-tighter">
          শাহিন এআই প্রো+
        </h1>
        <div className="flex gap-4">
          <button className="bg-gray-800 hover:bg-gray-700 px-6 py-2 rounded-lg text-sm font-medium transition-all duration-200 text-white">
            ডকুমেন্টেশন
          </button>
          <button className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 px-6 py-2 rounded-lg text-sm font-bold shadow-lg shadow-blue-900/50 transition-all duration-200 hover:scale-105 text-white">
            প্রিমিয়াম অ্যাক্সেস
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <VideoGenerator />
        </div>
        <div className="bg-gray-900/50 backdrop-blur-sm p-6 rounded-3xl border border-gray-800">
          <h2 className="text-xl font-bold mb-6 text-gray-200 flex items-center gap-2">
            <span className="w-2 h-8 bg-blue-500 rounded-full inline-block"></span>
            ১৫টি মাস্টার ফিচার
          </h2>
          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
            {features.map((f, i) => (
              <div key={i} className="group p-3 bg-black/40 border border-gray-800 rounded-xl hover:border-blue-500 hover:bg-blue-900/10 transition-all duration-300 cursor-pointer flex items-center gap-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-800 text-xs text-gray-400 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  {i + 1}
                </span>
                <span className="text-sm font-medium text-gray-300 group-hover:text-white">{f}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}