/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { motion, AnimatePresence } from "motion/react";
import { 
  BookOpen, 
  Search, 
  Sparkles, 
  Layout, 
  Target, 
  Zap, 
  CheckCircle2, 
  ArrowRight,
  Loader2,
  BookMarked,
  Layers,
  MousePointer2
} from "lucide-react";
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---

interface BookData {
  id: string;
  timestamp: number;
  positioning: {
    title: string;
    author: string;
    field: string;
    oneLiner: string;
  };
  coreProposition: {
    mainTitle: string;
    explanation: string[];
  };
  modules: {
    title: string;
    cards: string[];
  }[];
  conclusions: {
    remember: string[];
    practicalUse: string;
  };
  displaySuggestions: string;
}

// --- App Component ---

export default function App() {
  const [bookTitle, setBookTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BookData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState('正在深度解析书籍核心...');
  const [history, setHistory] = useState<BookData[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Load history from localStorage on mount
  useEffect(() => {
    const savedHistory = localStorage.getItem('bookmind_history');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error('Failed to load history', e);
      }
    }
  }, []);

  // Save history to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('bookmind_history', JSON.stringify(history));
  }, [history]);

  const loadingMessages = [
    '正在深度解析书籍核心...',
    '提炼高密度知识模块...',
    '构建交互式内容框架...',
    '优化页面展示逻辑...',
    '即将呈现专业级拆解...'
  ];

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (loading) {
      let i = 0;
      interval = setInterval(() => {
        setLoadingMessage(loadingMessages[i % loadingMessages.length]);
        i++;
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [loading]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookTitle.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `你现在是一名“书籍内容整理师 + 交互内容策划师”。请只根据书名《${bookTitle}》，整理出一份适合展示在网页中的中文内容，让用户用最短时间理解这本书的核心思想。

任务要求：
1. 不要先解释你不知道什么，直接基于常识、训练知识和合理推断整理内容。
2. 输出风格不是传统读书笔记，而是“输入一本书后立刻读懂核心内容”的页面文案。
3. 语言要高密度、清晰、克制，不要空话，不要套话，不要泛泛而谈。
4. 如果书名较冷门或信息不完全明确，请基于最可能对应的书整理。

请严格按以下 JSON 格式输出：
{
  "positioning": {
    "title": "书名",
    "author": "作者",
    "field": "所属领域",
    "oneLiner": "一句话说明这本书在讲什么"
  },
  "coreProposition": {
    "mainTitle": "总结这本书最重要的思想（有力量、适合做页面主标题）",
    "explanation": ["解释1", "解释2"]
  },
  "modules": [
    {
      "title": "主题模块1标题",
      "cards": ["观点1", "观点2", "观点3"]
    },
    {
      "title": "主题模块2标题",
      "cards": ["观点1", "观点2", "观点3"]
    },
    {
      "title": "主题模块3标题",
      "cards": ["观点1", "观点2", "观点3"]
    }
  ],
  "conclusions": {
    "remember": ["总结1", "总结2", "总结3"],
    "practicalUse": "现实里可以怎么用"
  },
  "displaySuggestions": "页面展示建议（一小段说明，突出哪些模块，哪些适合做按钮或卡片）"
}

每条观点卡片要求：一句话一个观点，尽量具体，优先提炼原书独特的方法、模型、案例或判断框架。`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              positioning: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  author: { type: Type.STRING },
                  field: { type: Type.STRING },
                  oneLiner: { type: Type.STRING }
                },
                required: ["title", "author", "field", "oneLiner"]
              },
              coreProposition: {
                type: Type.OBJECT,
                properties: {
                  mainTitle: { type: Type.STRING },
                  explanation: { type: Type.ARRAY, items: { type: Type.STRING } }
                },
                required: ["mainTitle", "explanation"]
              },
              modules: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    cards: { type: Type.ARRAY, items: { type: Type.STRING } }
                  },
                  required: ["title", "cards"]
                }
              },
              conclusions: {
                type: Type.OBJECT,
                properties: {
                  remember: { type: Type.ARRAY, items: { type: Type.STRING } },
                  practicalUse: { type: Type.STRING }
                },
                required: ["remember", "practicalUse"]
              },
              displaySuggestions: { type: Type.STRING }
            },
            required: ["positioning", "coreProposition", "modules", "conclusions", "displaySuggestions"]
          }
        }
      });

      const rawData = JSON.parse(response.text || '{}');
      const newBook: BookData = {
        ...rawData,
        id: crypto.randomUUID(),
        timestamp: Date.now()
      };
      
      setResult(newBook);
      setHistory(prev => [newBook, ...prev]);
    } catch (err) {
      console.error(err);
      setError('解析失败，请检查书名或稍后重试。');
    } finally {
      setLoading(false);
    }
  };

  const selectFromHistory = (book: BookData) => {
    setResult(book);
    setBookTitle(book.positioning.title);
    setIsSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const clearHistory = () => {
    if (confirm('确定要清空所有记录吗？')) {
      setHistory([]);
      localStorage.removeItem('bookmind_history');
    }
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB] text-[#111827] font-sans selection:bg-blue-100 flex">
      {/* Sidebar / Directory */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[60] lg:hidden"
            />
            <motion.aside 
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              className="fixed inset-y-0 left-0 w-72 bg-white border-r border-gray-100 z-[70] shadow-2xl lg:shadow-none lg:relative lg:flex flex-col"
            >
              <div className="p-6 border-b border-gray-50 flex items-center justify-between">
                <h2 className="font-bold text-gray-900 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-blue-600" />
                  已拆解目录
                </h2>
                <button 
                  onClick={() => setIsSidebarOpen(false)}
                  className="lg:hidden p-1 hover:bg-gray-100 rounded-md"
                >
                  <ArrowRight className="w-4 h-4 rotate-180" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {history.length === 0 ? (
                  <div className="text-center py-10 text-gray-400 text-sm">
                    暂无搜索记录
                  </div>
                ) : (
                  history.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => selectFromHistory(item)}
                      className={cn(
                        "w-full text-left p-3 rounded-xl transition-all group",
                        result?.id === item.id 
                          ? "bg-blue-50 text-blue-700 border border-blue-100" 
                          : "hover:bg-gray-50 text-gray-600 border border-transparent"
                      )}
                    >
                      <div className="font-semibold text-sm truncate mb-1 group-hover:text-blue-600">
                        {item.positioning.title}
                      </div>
                      <div className="text-[10px] opacity-60 flex justify-between items-center">
                        <span>{item.positioning.author}</span>
                        <span>{new Date(item.timestamp).toLocaleDateString()}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>

              {history.length > 0 && (
                <div className="p-4 border-t border-gray-50">
                  <button 
                    onClick={clearHistory}
                    className="w-full py-2 text-xs text-red-500 hover:bg-red-50 rounded-lg transition-colors font-medium"
                  >
                    清空历史目录
                  </button>
                </div>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex-1 min-w-0">
        {/* Header */}
        <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
          <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors relative"
              >
                <Layout className="w-5 h-5 text-gray-600" />
                {history.length > 0 && !isSidebarOpen && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-blue-600 rounded-full border-2 border-white" />
                )}
              </button>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <BookMarked className="text-white w-5 h-5" />
                </div>
                <span className="font-bold text-xl tracking-tight">BookMind</span>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-500">
              <a href="#" className="hover:text-blue-600 transition-colors">书籍定位</a>
              <a href="#" className="hover:text-blue-600 transition-colors">核心命题</a>
              <a href="#" className="hover:text-blue-600 transition-colors">主题模块</a>
              <a href="#" className="hover:text-blue-600 transition-colors">实操结论</a>
            </div>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-4 py-12">
        {/* Search Section */}
        <section className="mb-16 text-center">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-5xl font-extrabold mb-6 tracking-tight text-gray-900"
          >
            极速书籍核心拆解
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-lg text-gray-500 mb-10 max-w-2xl mx-auto"
          >
            输入书名，即刻获取高密度、专业级的核心思想与交互式内容策划方案。
          </motion.p>

          <motion.form 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            onSubmit={handleGenerate}
            className="relative max-w-2xl mx-auto"
          >
            <input
              type="text"
              value={bookTitle}
              onChange={(e) => setBookTitle(e.target.value)}
              placeholder="输入书名，例如：《证券分析》"
              className="w-full h-16 pl-14 pr-32 bg-white border border-gray-200 rounded-2xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-lg transition-all"
            />
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 w-6 h-6" />
            <button
              type="submit"
              disabled={loading || !bookTitle.trim()}
              className="absolute right-2 top-2 bottom-2 px-6 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
              <span>开始拆解</span>
            </button>
          </motion.form>
        </section>

        {/* Loading State */}
        <AnimatePresence>
          {loading && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-20"
            >
              <div className="relative w-16 h-16 mb-6">
                <div className="absolute inset-0 border-4 border-blue-100 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
              </div>
              <p className="text-blue-600 font-medium animate-pulse">{loadingMessage}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-xl text-center mb-8">
            {error}
          </div>
        )}

        {/* Result Section */}
        {result && !loading && (
          <motion.div 
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-12"
          >
            {/* 1. Positioning */}
            <section className="bg-white rounded-3xl p-8 md:p-12 border border-gray-100 shadow-sm">
              <div className="flex items-center gap-3 mb-8">
                <div className="px-3 py-1 bg-blue-50 text-blue-600 text-xs font-bold uppercase tracking-wider rounded-full">
                  一、书籍定位
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <h2 className="text-3xl font-bold mb-4 text-gray-900">{result.positioning.title}</h2>
                  <div className="flex flex-wrap gap-3 mb-6">
                    <span className="px-3 py-1 bg-gray-100 text-gray-600 text-sm rounded-lg font-medium">
                      作者：{result.positioning.author}
                    </span>
                    <span className="px-3 py-1 bg-gray-100 text-gray-600 text-sm rounded-lg font-medium">
                      领域：{result.positioning.field}
                    </span>
                  </div>
                </div>
                <div className="flex items-center">
                  <div className="bg-gray-50 p-6 rounded-2xl border-l-4 border-blue-600 italic text-gray-700 leading-relaxed">
                    “{result.positioning.oneLiner}”
                  </div>
                </div>
              </div>
            </section>

            {/* 2. Core Proposition */}
            <section className="text-center py-12">
              <div className="inline-block px-3 py-1 bg-blue-50 text-blue-600 text-xs font-bold uppercase tracking-wider rounded-full mb-6">
                二、核心命题
              </div>
              <h3 className="text-4xl md:text-5xl font-black mb-8 text-gray-900 leading-tight">
                {result.coreProposition.mainTitle}
              </h3>
              <div className="max-w-3xl mx-auto space-y-4">
                {result.coreProposition.explanation.map((exp, idx) => (
                  <p key={idx} className="text-lg text-gray-600 leading-relaxed">
                    {exp}
                  </p>
                ))}
              </div>
            </section>

            {/* 3. Theme Modules */}
            <section className="space-y-8">
              <div className="flex items-center gap-3">
                <div className="px-3 py-1 bg-blue-50 text-blue-600 text-xs font-bold uppercase tracking-wider rounded-full">
                  三、主题模块
                </div>
              </div>
              <div className="grid md:grid-cols-3 gap-6">
                {result.modules.map((module, mIdx) => (
                  <div key={mIdx} className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-2 mb-6">
                      <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                        {mIdx === 0 ? <Target className="w-4 h-4 text-blue-600" /> : 
                         mIdx === 1 ? <Layers className="w-4 h-4 text-blue-600" /> : 
                         <Zap className="w-4 h-4 text-blue-600" />}
                      </div>
                      <h4 className="font-bold text-gray-900">{module.title}</h4>
                    </div>
                    <ul className="space-y-4">
                      {module.cards.map((card, cIdx) => (
                        <li key={cIdx} className="flex gap-3 text-sm text-gray-600 leading-relaxed">
                          <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0" />
                          {card}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>

            {/* 4. Conclusions */}
            <section className="bg-gray-900 rounded-3xl p-8 md:p-12 text-white">
              <div className="flex items-center gap-3 mb-10">
                <div className="px-3 py-1 bg-white/10 text-white/80 text-xs font-bold uppercase tracking-wider rounded-full">
                  四、阅读后可直接带走的结论
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-12">
                <div className="space-y-6">
                  <h5 className="text-xl font-bold flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-blue-400" />
                    最值得记住的内容
                  </h5>
                  <ul className="space-y-4">
                    {result.conclusions.remember.map((item, idx) => (
                      <li key={idx} className="flex gap-4 p-4 bg-white/5 rounded-xl border border-white/10">
                        <span className="text-blue-400 font-bold">0{idx + 1}</span>
                        <span className="text-gray-300">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-6">
                  <h5 className="text-xl font-bold flex items-center gap-2">
                    <ArrowRight className="w-5 h-5 text-blue-400" />
                    现实中如何应用
                  </h5>
                  <div className="p-6 bg-blue-600 rounded-2xl font-medium leading-relaxed shadow-lg shadow-blue-900/20">
                    {result.conclusions.practicalUse}
                  </div>
                </div>
              </div>
            </section>

            {/* 5. Display Suggestions */}
            <section className="bg-blue-50 rounded-2xl p-8 border border-blue-100">
              <div className="flex items-center gap-3 mb-6">
                <MousePointer2 className="w-5 h-5 text-blue-600" />
                <h5 className="font-bold text-blue-900">页面展示建议</h5>
              </div>
              <p className="text-blue-800 leading-relaxed">
                {result.displaySuggestions}
              </p>
            </section>

            {/* Footer CTA */}
            <footer className="text-center py-12 border-t border-gray-100">
              <p className="text-gray-400 text-sm mb-4">由 BookMind AI 深度提炼</p>
              <button 
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="text-blue-600 font-semibold hover:underline"
              >
                拆解下一本书
              </button>
            </footer>
          </motion.div>
        )}
      </main>
    </div>
    </div>
  );
}
