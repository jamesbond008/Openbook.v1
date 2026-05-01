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
  MousePointer2,
  Copy,
  Download,
  Network,
  FileText,
  AlertCircle
} from "lucide-react";
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[《》]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function normalizeBookKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[《》“”"'‘’.,，。:：;；!！?？()（）\-\s]/g, '')
    .trim();
}

function buildDedupeHint(value: string) {
  return normalizeBookKey(value) || 'untitled';
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
  feynmanExplanation: {
    authorContext: string[];
    explanationAngles: {
      title: string;
      explanation: string;
    }[];
    oneSentenceSummary: string;
    plainLanguage?: string;
    analogy?: string;
    teachBack?: string[];
  };
  readingPipeline: {
    coreQuestion: string;
    keyModels: string[];
    keyCases: string[];
    transferScenarios: string[];
    actionChecklist: string[];
    alphaNotes: string[];
  };
  displaySuggestions: string;
  obsidianPipeline: {
    vaultPlacement: {
      area: string;
      moc: string;
      filename: string;
      tags: string[];
    };
    evergreenCandidates: {
      concept: string;
      definition: string;
      links: string[];
    }[];
    noteMarkdown: string;
  };
}

interface ReadingPipelineRecord {
  id: string;
  title: string;
  dedupeKey: string;
  author: string;
  field: string;
  status: '已查阅' | '已拆解' | '可入库';
  stage: 'Inbox' | 'Decode' | 'Vault';
  notionProcess?: '📥 输入阶段' | '⚔️ AI对谈' | '💡Alpha笔记' | '✅ 已完成';
  source: string;
  lastReviewedAt: number;
  moc: string;
  filename: string;
  tags: string[];
  coreQuestionNotes?: string;
  alphaNotes?: string;
  pageUrl?: string;
}

interface PendingFieldChange {
  field: string;
  from: string;
  to: string;
}

interface PendingPipelineChange {
  action: 'create' | 'update' | 'noop';
  candidate: ReadingPipelineRecord;
  existing: ReadingPipelineRecord | null;
  changes: PendingFieldChange[];
}

const SHARED_REVIEWED_TITLES = [
  '魔鬼数学',
  '醉汉的脚步',
  '信号与噪声',
  '金融炼金术',
  '自私的基因',
  '行为',
  'What I Learned About Investing from Darwin',
  '红皇后',
  '影响力',
  '思考，快与慢',
  '穷查理宝典',
  '人类误判心理学',
  '系统之美',
  '工程与人性',
  '设计心理学',
  '魔鬼经济学',
  '竞争优势',
  '自下而上',
  '卧底经济学家',
  '狂热分子',
  '沉思录',
  '如何阅读一本书',
  '索罗斯谈索罗斯',
  '生活在极限之内',
  '枪炮、病菌与钢铁',
  '洛克菲勒传',
  '清晰思考',
  '从北京到北京',
  '人类简史',
  '结构是什么',
  '三体',
  '三体II：黑暗森林',
  '三体III：死神永生',
  '开放社会及其敌人',
  '合作的进化',
  '冲突的战略',
  '策略思维',
  '有限与无限的游戏',
  '费曼物理学讲义',
  '银河系漫游指南',
  '无穷的开始',
  '阿特拉斯耸耸肩',
  '非对称风险',
  '国富论',
  '1984',
  '真实世界的脉络',
  '从0到1',
  '美国精神的封闭',
  '主权个人',
  '谁说大象不能跳舞',
  '穷爸爸富爸爸',
  '独立宣言',
  'generation to generation life cycles of the family business',
  '股票作手回忆录',
  '股票大作手操盘术',
  '欲望的博弈',
  '权力 48 法则',
  '寻找智慧：从达尔文到芒格',
  '纳瓦尔宝典',
  '原则',
  '债务危机',
  '周期',
  '投资最重要的事',
  '聪明的投资者',
  '证券分析',
];

const STAGE_RANK: Record<ReadingPipelineRecord['stage'], number> = {
  Inbox: 0,
  Decode: 1,
  Vault: 2,
};

const STATUS_RANK: Record<ReadingPipelineRecord['status'], number> = {
  '已查阅': 0,
  '已拆解': 1,
  '可入库': 2,
};

function createFallbackFeynmanExplanation(title: string): BookData['feynmanExplanation'] {
  const normalizedTitle = title.trim() || '这本书';

  return {
    authorContext: [
      `《${normalizedTitle}》需要放回作者的问题意识里理解：作者不是凭空写作，而是在回应自己所处时代里某个真实的困惑、冲突或低效做法。`,
      '读这本书时，先不要急着背结论，而要先问：作者看见了什么问题，为什么他觉得原来的解释不够好。',
    ],
    explanationAngles: [
      {
        title: '这本书到底在解决什么问题',
        explanation: `用大白话讲，《${normalizedTitle}》想帮你把一个原本模糊的问题看清楚：哪些判断是错的，哪些做法只是习惯，哪些地方可以换一种思路。`,
      },
      {
        title: '它为什么不是普通总结',
        explanation: '这本书真正有价值的地方，不是多给你一些信息，而是提供一套能反复调用的观察方式，让你在现实问题里也能重新判断。',
      },
      {
        title: '读完后跟你有什么关系',
        explanation: '如果你能把书里的核心观点讲给别人听，并能说明它适合用在哪些场景、不适合用在哪些场景，这本书才算真的被你吸收。',
      },
    ],
    oneSentenceSummary: `作者写《${normalizedTitle}》是想告诉你：真正重要的不是记住书里的每个细节，而是把它变成一种能解释问题、指导行动的思考方式。`,
  };
}

function normalizeFeynmanExplanation(
  value: Partial<BookData['feynmanExplanation']> | undefined,
  title: string,
): BookData['feynmanExplanation'] {
  const fallback = createFallbackFeynmanExplanation(title);
  const legacyTeachBack = value?.teachBack || [];
  const legacyAngles = [
    value?.plainLanguage
      ? {
          title: '这本书到底在讲什么',
          explanation: value.plainLanguage,
        }
      : null,
    value?.analogy
      ? {
          title: '可以怎样类比理解',
          explanation: value.analogy,
        }
      : null,
    legacyTeachBack.length
      ? {
          title: '讲给别人听时要抓住什么',
          explanation: legacyTeachBack.join(' '),
        }
      : null,
  ].filter(Boolean) as BookData['feynmanExplanation']['explanationAngles'];

  return {
    authorContext:
      value?.authorContext?.length
        ? value.authorContext
        : fallback.authorContext,
    explanationAngles:
      value?.explanationAngles?.length
        ? value.explanationAngles
        : legacyAngles.length
          ? legacyAngles
          : fallback.explanationAngles,
    oneSentenceSummary:
      value?.oneSentenceSummary ||
      fallback.oneSentenceSummary,
  };
}

function createFallbackReadingPipeline(title: string): BookData['readingPipeline'] {
  const normalizedTitle = title.trim() || '这本书';

  return {
    coreQuestion: `《${normalizedTitle}》真正要帮读者回答什么问题？以及这个问题应该如何迁移到现实决策里？`,
    keyModels: [
      '抓住作者反复使用的核心模型，而不是堆积零散知识点。',
      '把关键概念翻译成判断步骤，形成可执行的思考顺序。',
      '优先沉淀那些能跨场景复用的原则、框架和提醒。',
    ],
    keyCases: [
      '回看书里最能代表作者方法论的经典案例。',
      '优先记录那些能解释常见误判、错误直觉或关键转折的例子。',
      '把案例写成“情境 - 判断 - 结果 - 启示”的形式，便于复盘。',
    ],
    transferScenarios: [
      '迁移到投资、产品判断、写作、管理或长期学习策略。',
      '遇到信息噪声很高的情境时，用这本书帮你缩小判断范围。',
      '当现实问题没有标准答案时，用它搭建更稳的思考路径。',
    ],
    actionChecklist: [
      '先写下这本书真正回答的核心问题。',
      '提炼 3 个关键模型和 3 个代表性案例。',
      '把它们迁移到自己的现实问题里做一次演练。',
      '最终压缩成几条可以进入 Alpha 笔记的浓缩判断。',
    ],
    alphaNotes: [
      '真正值得留下来的不是信息量，而是可重复调用的判断方式。',
      '拆书的目标不是复述，而是把观点变成自己的认知工具。',
      '如果一个观点不能指导行动，它还没有完成内化。',
    ],
  };
}

function createMockBookData(title: string): BookData {
  const normalizedTitle = title.trim() || '未命名书籍';
  const slug = slugify(normalizedTitle) || 'bookmind-note';
  const field = normalizedTitle.includes('投资') || normalizedTitle.includes('证券') ? 'Investing' : 'AI-Research';
  const moc = field === 'Investing' ? 'MOC-Investing' : 'MOC-AI-Research';
  const tags = ['bookmind', 'book-note', 'obsidian-pipeline', slug];

  const markdown = `---
title: "${normalizedTitle}"
author: "待模型补全"
type: "book-interpretation"
field: "${field}"
tags: [${tags.map((tag) => `"${tag}"`).join(', ')}]
---

# ${normalizedTitle}

> 一句话定义：
> 这是对《${normalizedTitle}》的结构化拆解，适合继续沉淀进 Obsidian Vault。

## 核心命题

- 用一句主标题总结这本书最值得记住的思想
- 补两到三条解释，说明为什么这个思想是全书中心

## 读书流水线拆书

### 这本书真正回答的问题
- 这本书到底要帮读者解决什么问题

### 关键模型
- 模型 1
- 模型 2
- 模型 3

### 代表性案例 / 实验
- 案例 1
- 案例 2
- 案例 3

### 迁移到现实场景
- 场景 1
- 场景 2
- 场景 3

### 行动清单
- 行动 1
- 行动 2
- 行动 3

### Alpha 笔记
- 笔记 1
- 笔记 2
- 笔记 3

## 主题模块

### 模块一：核心命题
- 提炼独特模型
- 提炼关键概念
- 提炼最强论点

### 模块二：分析视角
- 这本书如何看问题
- 它与同类书最大的区别
- 哪些案例最有代表性

### 模块三：如何使用
- 读完后能立刻实践什么
- 用什么场景验证理解
- 哪类决策最适合调用这本书

## 阅读后可直接带走的结论

- 记住 1
- 记住 2
- 记住 3

## 费曼学习解释

### 作者和时代背景
- 这本书需要放回作者的问题意识里理解：作者不是凭空写作，而是在回应自己所处时代里某个真实的阅读、学习或知识管理问题。
- 它回应的是一个很现实的困境：信息越来越多，但真正能被复用、能改变判断和行动的知识并没有同步变多。

### 用大白话讲给一个没读过这本书的朋友听

#### 它到底想解决什么
这本书可以被理解成一套把阅读内容转成可复用知识资产的方法，不是为了让你多存几篇笔记，而是为了让知识以后还能被找回、讲清和调用。

#### 为什么普通摘抄不够
普通摘抄像把东西堆进抽屉，短期看起来很多，长期很难使用；真正有效的拆书要把观点变成问题、模型、案例和行动。

#### 跟你有什么关系
如果你能把一本书讲给另一个人听，并且能说清它适合解决什么问题，这本书才算从信息变成了你的工具。

### 一句话总结
**作者写这本书是想告诉你：阅读的终点不是保存内容，而是把内容变成能解释问题、指导行动、还能讲给别人听的知识资产。**

## 关联知识

- [[${moc}]]
- [[${normalizedTitle} 核心概念]]
- [[${normalizedTitle} 实践清单]]
`;

  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    positioning: {
      title: normalizedTitle,
      author: '待连接 Gemini API 自动补全',
      field,
      oneLiner: '当前处于本地演示模式：已生成可用于网页展示与 Obsidian 沉淀的结构化骨架。',
    },
    coreProposition: {
      mainTitle: `把《${normalizedTitle}》整理成“可阅读、可沉淀、可索引”的知识资产`,
      explanation: [
        '这一版结果用于演示接入 Obsidian Vault Pipeline 后的最终形态：不仅看一本书，还能把内容沉淀进知识库。',
        '补上 GEMINI_API_KEY 后，这里会由模型返回真实作者、领域、核心命题、主题模块与 Markdown 笔记。',
      ],
    },
    modules: [
      {
        title: '网页展示',
        cards: [
          '先给用户一句最强主标题，让他几秒内知道这本书在讲什么。',
          '把内容拆成三个模块，避免大段摘要。',
          '每条卡片都要足够短，但有独立信息量。',
        ],
      },
      {
        title: '知识提炼',
        cards: [
          '生成 Evergreen 候选概念，方便继续原子化拆分。',
          '给出建议 MOC 与标签，方便后续归档和索引。',
          '把“读完一本书”升级成“进入知识网络的入口”。',
        ],
      },
      {
        title: 'Vault 导出',
        cards: [
          '直接输出完整 Markdown，减少手工整理。',
          '保留 Obsidian 双向链接格式，方便后续关联。',
          '让前端内容和知识库沉淀共享同一份结构化结果。',
        ],
      },
    ],
    conclusions: {
      remember: [
        'James Reading OS 现在不只生成书籍拆解，也能生成适合知识库落地的笔记。',
        'Obsidian Pipeline 的关键思想是：解读之后要继续提炼、索引和复用。',
        '最自然的接法是前端直接输出 Vault 友好的结构，而不是只停留在展示层。',
      ],
      practicalUse: '配置 GEMINI_API_KEY 后，输入任意书名即可得到网页内容 + Obsidian Markdown，一键复制或下载进入你的 vault。',
    },
    feynmanExplanation: normalizeFeynmanExplanation(undefined, normalizedTitle),
    readingPipeline: createFallbackReadingPipeline(normalizedTitle),
    displaySuggestions:
      '在页面里把“网页阅读结果”和“知识库沉淀结果”并排展示最合适：上半部分负责快速理解，下半部分负责导出与长期复用。',
    obsidianPipeline: {
      vaultPlacement: {
        area: field,
        moc,
        filename: `${new Date().toISOString().slice(0, 10)}_${slug}_深度解读.md`,
        tags,
      },
      evergreenCandidates: [
        {
          concept: `${normalizedTitle} 的核心命题`,
          definition: '把这本书最值得长期记住的思想提炼成一个可复用概念。',
          links: [`[[${moc}]]`, `[[${normalizedTitle}]]`],
        },
        {
          concept: `${normalizedTitle} 的实践框架`,
          definition: '把书中方法压缩成一套现实里可重复调用的行动框架。',
          links: [`[[${normalizedTitle} 核心命题]]`, '[[Evergreen Notes]]'],
        },
      ],
      noteMarkdown: markdown,
    },
  };
}

function createSeedPipelineRecord(title: string): ReadingPipelineRecord {
  return {
    id: crypto.randomUUID(),
    title,
    dedupeKey: buildDedupeHint(title),
    author: '待整理',
    field: '待分类',
    status: '已查阅',
    stage: 'Inbox',
    source: 'Gemini Share',
    lastReviewedAt: Date.now(),
    moc: '待判定',
    filename: '',
    tags: ['reading-pipeline', 'reviewed'],
  };
}

function createPipelineRecordFromBook(book: BookData): ReadingPipelineRecord {
  return {
    id: book.id,
    title: book.positioning.title,
    dedupeKey: buildDedupeHint(book.positioning.title),
    author: book.positioning.author,
    field: book.positioning.field,
    status: '可入库',
    stage: 'Vault',
    source: 'James Reading OS',
    lastReviewedAt: book.timestamp,
    moc: book.obsidianPipeline.vaultPlacement.moc,
    filename: book.obsidianPipeline.vaultPlacement.filename,
    tags: book.obsidianPipeline.vaultPlacement.tags,
  };
}

function mergePipelineRecords(
  existing: ReadingPipelineRecord[],
  incoming: ReadingPipelineRecord[],
): ReadingPipelineRecord[] {
  const map = new Map<string, ReadingPipelineRecord>();

  [...existing, ...incoming].forEach((record) => {
    const key = record.dedupeKey || normalizeBookKey(record.title);
    const prev = map.get(key);

    if (!prev) {
      map.set(key, record);
      return;
    }

    const stage =
      STAGE_RANK[record.stage] >= STAGE_RANK[prev.stage] ? record.stage : prev.stage;
    const status =
      STATUS_RANK[record.status] >= STATUS_RANK[prev.status] ? record.status : prev.status;
    const latest = record.lastReviewedAt >= prev.lastReviewedAt ? record : prev;
    const richer = record.filename || record.moc !== '待判定' ? record : prev;

    map.set(key, {
      ...prev,
      ...latest,
      ...richer,
      dedupeKey: key,
      stage,
      status,
      id: prev.id,
      tags: Array.from(new Set([...(prev.tags || []), ...(record.tags || [])])),
    });
  });

  return Array.from(map.values()).sort((a, b) => b.lastReviewedAt - a.lastReviewedAt);
}

function stringifyRecordValue(value: string | string[] | number) {
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  return String(value ?? '');
}

function buildPendingPipelineChange(
  existingRecords: ReadingPipelineRecord[],
  candidate: ReadingPipelineRecord,
): PendingPipelineChange {
  const existing =
    existingRecords.find((record) => record.dedupeKey === candidate.dedupeKey) || null;

  if (!existing) {
    return {
      action: 'create',
      candidate,
      existing: null,
      changes: [
        { field: '书名', from: '不存在', to: candidate.title },
        { field: '作者', from: '不存在', to: candidate.author },
        { field: '领域', from: '不存在', to: candidate.field },
        { field: '状态', from: '不存在', to: candidate.status },
        { field: '阶段', from: '不存在', to: candidate.stage },
        { field: 'MOC', from: '不存在', to: candidate.moc },
        { field: '标签', from: '不存在', to: stringifyRecordValue(candidate.tags) },
      ],
    };
  }

  const fields: Array<[string, string | string[] | number, string | string[] | number]> = [
    ['书名', existing.title, candidate.title],
    ['作者', existing.author, candidate.author],
    ['领域', existing.field, candidate.field],
    ['状态', existing.status, candidate.status],
    ['阶段', existing.stage, candidate.stage],
    ['来源', existing.source, candidate.source],
    ['MOC', existing.moc, candidate.moc],
    ['文件名', existing.filename, candidate.filename],
    ['标签', existing.tags, candidate.tags],
  ];

  const changes = fields
    .map(([field, from, to]) => ({
      field,
      from: stringifyRecordValue(from),
      to: stringifyRecordValue(to),
    }))
    .filter((item) => item.from !== item.to);

  return {
    action: changes.length ? 'update' : 'noop',
    candidate,
    existing,
    changes,
  };
}

// --- App Component ---

export default function App() {
  const [bookTitle, setBookTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BookData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState('正在深度解析书籍核心...');
  const [history, setHistory] = useState<BookData[]>([]);
  const [readingDatabase, setReadingDatabase] = useState<ReadingPipelineRecord[]>([]);
  const [pendingPipelineChange, setPendingPipelineChange] = useState<PendingPipelineChange | null>(null);
  const [databaseLoading, setDatabaseLoading] = useState(true);
  const [storageConfigured, setStorageConfigured] = useState<boolean | null>(null);
  const [storageMessage, setStorageMessage] = useState<string | null>(null);
  const [storageSyncing, setStorageSyncing] = useState(false);
  const [storageMode, setStorageMode] = useState<'local' | 'notion' | 'ima'>('local');
  const [storageLabel, setStorageLabel] = useState('本地数据库');
  const [historyLoading, setHistoryLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [copiedContentId, setCopiedContentId] = useState<string | null>(null);

  const parseStorageMode = (value: unknown): 'local' | 'notion' | 'ima' => {
    if (value === 'notion' || value === 'ima') return value;
    return 'local';
  };

  const normalizeHistoryBook = (item: BookData): BookData => ({
    ...item,
    feynmanExplanation:
      normalizeFeynmanExplanation(item.feynmanExplanation, item.positioning?.title || '这本书'),
    readingPipeline:
      item.readingPipeline ?? createFallbackReadingPipeline(item.positioning?.title || '这本书'),
  });

  const saveHistoryBook = async (book: BookData) => {
    try {
      const response = await fetch('/api/history', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({book}),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || '保存已拆解目录失败。');
      }

      setHistory((data.history || []).map(normalizeHistoryBook));
      localStorage.removeItem('bookmind_history');
    } catch (historyError) {
      console.error(historyError);
    }
  };

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const response = await fetch('/api/history');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || '读取已拆解目录失败。');
      }

      const serverHistory = (data.history || []).map(normalizeHistoryBook);
      setHistory(serverHistory);

      const savedHistory = localStorage.getItem('bookmind_history');
      if (savedHistory && serverHistory.length === 0) {
        try {
          const parsedHistory = JSON.parse(savedHistory) as BookData[];
          for (const item of parsedHistory) {
            await saveHistoryBook(normalizeHistoryBook(item));
          }
        } catch (migrationError) {
          console.error('Failed to migrate local history', migrationError);
        }
      }
    } catch (historyError) {
      console.error(historyError);
      const savedHistory = localStorage.getItem('bookmind_history');
      if (savedHistory) {
        try {
          const parsedHistory = JSON.parse(savedHistory) as BookData[];
          setHistory(parsedHistory.map(normalizeHistoryBook));
        } catch (e) {
          console.error('Failed to load fallback history', e);
        }
      }
    } finally {
      setHistoryLoading(false);
    }
  };

  const fetchDatabase = async () => {
    setDatabaseLoading(true);
    try {
      const response = await fetch('/api/books');
      const data = await response.json();
      setStorageMode(parseStorageMode(data.storageMode));
      setStorageLabel(data.storageLabel || '本地数据库');

      if (!response.ok) {
        setStorageConfigured(Boolean(data.configured));
        setStorageMessage(data.message || '读取数据库失败。');
        setReadingDatabase([]);
        return;
      }

      setStorageConfigured(true);
      setStorageMessage(null);
      setReadingDatabase(data.records || []);
    } catch (fetchError) {
      console.error(fetchError);
      setStorageConfigured(false);
      setStorageMessage('无法连接到本地存储服务，请确认本地 API 已启动。');
      setReadingDatabase([]);
    } finally {
      setDatabaseLoading(false);
    }
  };

  useEffect(() => {
    void fetchHistory();
    void fetchDatabase();
  }, []);

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

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      console.error('Failed to copy text', e);
      return false;
    }
  };

  const buildDisplayCopyContent = (book: BookData) => {
    return [
      `# ${book.positioning.title}`,
      '',
      '## 一、书籍定位',
      '',
      `- 书名：${book.positioning.title}`,
      `- 作者：${book.positioning.author}`,
      `- 领域：${book.positioning.field}`,
      `- 一句话：${book.positioning.oneLiner}`,
      '',
      '## 二、核心命题',
      '',
      `### ${book.coreProposition.mainTitle}`,
      '',
      ...book.coreProposition.explanation.map((item) => `- ${item}`),
      '',
      '## 三、主题模块',
      ...book.modules.flatMap((module) => [
        '',
        `### ${module.title}`,
        ...module.cards.map((card) => `- ${card}`),
      ]),
      '',
      '## 四、读书流水线拆书',
      '',
      '### 这本书真正回答的问题',
      '',
      book.readingPipeline.coreQuestion,
      '',
      '### 行动清单',
      ...book.readingPipeline.actionChecklist.map((item, index) => `${index + 1}. ${item}`),
      '',
      '### 关键模型',
      ...book.readingPipeline.keyModels.map((item) => `- ${item}`),
      '',
      '### 代表性案例',
      ...book.readingPipeline.keyCases.map((item) => `- ${item}`),
      '',
      '### 迁移场景',
      ...book.readingPipeline.transferScenarios.map((item) => `- ${item}`),
      '',
      '### Alpha 笔记',
      ...book.readingPipeline.alphaNotes.map((item) => `- ${item}`),
      '',
      '## 五、阅读后可直接带走的结论',
      '',
      '### 最值得记住的内容',
      ...book.conclusions.remember.map((item) => `- ${item}`),
      '',
      '### 现实中如何应用',
      '',
      book.conclusions.practicalUse,
      '',
      '## 六、费曼学习解释',
      '',
      '### 作者和时代背景',
      ...book.feynmanExplanation.authorContext.map((item) => `- ${item}`),
      '',
      '### 用大白话讲给一个没读过这本书的朋友听',
      ...book.feynmanExplanation.explanationAngles.flatMap((angle) => [
        '',
        `#### ${angle.title}`,
        angle.explanation,
      ]),
      '',
      '### 一句话总结',
      '',
      `**${book.feynmanExplanation.oneSentenceSummary}**`,
    ].join('\n');
  };

  const copyBookContent = async (book: BookData) => {
    const didCopy = await copyToClipboard(buildDisplayCopyContent(book));
    if (!didCopy) return;

    setCopiedContentId(book.id);
    window.setTimeout(() => {
      setCopiedContentId((currentId) => (currentId === book.id ? null : currentId));
    }, 1600);
  };

  const downloadMarkdown = (book: BookData) => {
    const blob = new Blob([book.obsidianPipeline.noteMarkdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = book.obsidianPipeline.vaultPlacement.filename || `${book.positioning.title}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const stagePipelineChangeForReview = async (book: BookData) => {
    setStorageSyncing(true);
    try {
      const response = await fetch('/api/preview-book', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({book}),
      });
      const data = await response.json();
      setStorageMode(parseStorageMode(data.storageMode));
      setStorageLabel(data.storageLabel || '本地数据库');

      if (!response.ok) {
        setStorageConfigured(Boolean(data.configured));
        setStorageMessage(data.message || '生成存储预览失败。');
        setPendingPipelineChange(null);
        return;
      }

      setStorageConfigured(true);
      setStorageMessage(null);
      setPendingPipelineChange(data.preview || null);
    } catch (previewError) {
      console.error(previewError);
      setStorageConfigured(false);
      setStorageMessage('无法连接到本地存储服务，请确认本地 API 已启动。');
      setPendingPipelineChange(null);
    } finally {
      setStorageSyncing(false);
    }
  };

  const syncBookDirect = async (book: BookData) => {
    setStorageSyncing(true);
    try {
      const response = await fetch('/api/sync-book', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({book}),
      });
      const data = await response.json();
      const nextStorageMode = parseStorageMode(data.storageMode);
      setStorageMode(nextStorageMode);
      setStorageLabel(data.storageLabel || '本地数据库');

      if (!response.ok) {
        setStorageConfigured(Boolean(data.configured));
        setStorageMessage(data.message || '写入数据库失败。');
        return;
      }

      setStorageConfigured(true);
      setStorageMessage(
        nextStorageMode === 'notion'
          ? '已同步到 Notion 读书流水线。'
          : nextStorageMode === 'ima'
            ? '已自动同步到 James的读书分享 知识库，并保存到本地书本文件夹。'
            : '已写入本地数据库，并保存到本地书本文件夹。',
      );
      setPendingPipelineChange(null);
      await fetchDatabase();
    } catch (syncError) {
      console.error(syncError);
      setStorageConfigured(false);
      setStorageMessage('无法连接到本地存储服务，请确认本地 API 已启动。');
    } finally {
      setStorageSyncing(false);
    }
  };

  const confirmPipelineChange = async () => {
    if (!pendingPipelineChange || pendingPipelineChange.action === 'noop') {
      setPendingPipelineChange(null);
      return;
    }

    if (!result) return;

    setStorageSyncing(true);
    try {
      const response = await fetch('/api/sync-book', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({book: result}),
      });
      const data = await response.json();
      const nextStorageMode = parseStorageMode(data.storageMode);
      setStorageMode(nextStorageMode);
      setStorageLabel(data.storageLabel || '本地数据库');

      if (!response.ok) {
        setStorageConfigured(Boolean(data.configured));
        setStorageMessage(data.message || '写入数据库失败。');
        return;
      }

      setStorageConfigured(true);
      setStorageMessage(
        nextStorageMode === 'notion'
          ? '已同步到 Notion 读书流水线。'
          : nextStorageMode === 'ima'
            ? '已同步到 James的读书分享 知识库。'
            : '已写入本地数据库。',
      );
      setPendingPipelineChange(null);
      await fetchDatabase();
    } catch (syncError) {
      console.error(syncError);
      setStorageConfigured(false);
      setStorageMessage('无法连接到本地存储服务，请确认本地 API 已启动。');
    } finally {
      setStorageSyncing(false);
    }
  };

  const cancelPipelineChange = () => {
    setPendingPipelineChange(null);
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookTitle.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const apiKey = process.env.GEMINI_API_KEY || '';
      if (!apiKey) {
        const mockBook = createMockBookData(bookTitle);
        setResult(mockBook);
        await saveHistoryBook(mockBook);
        if (storageMode === 'ima') {
          await syncBookDirect(mockBook);
        } else {
          await stagePipelineChangeForReview(mockBook);
        }
        return;
      }

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `你现在是一名“书籍内容整理师 + 交互内容策划师”。请只根据书名《${bookTitle}》，整理出一份适合展示在网页中的中文内容，让用户用最短时间理解这本书的核心思想。

额外要求：请学习 Obsidian Vault Pipeline 的思路，把输出同时整理成可沉淀进知识库的结构化笔记。也就是说，结果不仅要适合网页展示，还要适合进入 Obsidian vault，后续可继续做 Evergreen 提炼和 MOC 索引。

任务要求：
1. 不要先解释你不知道什么，直接基于常识、训练知识和合理推断整理内容。
2. 输出风格不是传统读书笔记，而是“输入一本书后立刻读懂核心内容”的页面文案。
3. 语言要高密度、清晰、克制，不要空话，不要套话，不要泛泛而谈。
4. 如果书名较冷门或信息不完全明确，请基于最可能对应的书整理。
5. 请让结果兼容“输入 → 解读 → 提炼 → 索引”的知识管线思路。
6. 请参考以下内容偏好：先给一个抓人的主判断，再回答“这本书真正解决什么问题”，然后提炼关键模型、代表性案例、现实迁移场景、行动清单和 Alpha 笔记。
7. 不要只给抽象总结，优先输出作者独特的判断框架、经典实验/案例，以及用户可以立刻调用的决策动作。
8. 结果要像我自己的读书流水线页面：可以直接拿去拆书、复盘、进入知识库，而不是一篇普通书评。

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
  "feynmanExplanation": {
    "authorContext": [
      "作者是谁、处在什么时代或专业背景里，为什么会写这本书",
      "这本书回应了什么现实问题、思想潮流或旧解释的不足"
    ],
    "explanationAngles": [
      {
        "title": "角度 1 的小标题，直接点出关键词",
        "explanation": "用大白话讲清楚这个角度"
      },
      {
        "title": "角度 2 的小标题，直接点出关键词",
        "explanation": "用大白话讲清楚这个角度"
      },
      {
        "title": "角度 3 的小标题，直接点出关键词",
        "explanation": "用大白话讲清楚这个角度"
      }
    ],
    "oneSentenceSummary": "用一句加粗收尾式总结，把本书核心主张和对读者的意义焊在一起"
  },
  "readingPipeline": {
    "coreQuestion": "这本书真正回答的核心问题",
    "keyModels": ["关键模型1", "关键模型2", "关键模型3"],
    "keyCases": ["代表性案例或实验1", "代表性案例或实验2", "代表性案例或实验3"],
    "transferScenarios": ["可以迁移到现实的场景1", "场景2", "场景3"],
    "actionChecklist": ["读完后马上能做的动作1", "动作2", "动作3"],
    "alphaNotes": ["适合进入 Alpha 笔记的浓缩判断1", "判断2", "判断3"]
  },
  "displaySuggestions": "页面展示建议（一小段说明，突出哪些模块，哪些适合做按钮或卡片）",
  "obsidianPipeline": {
    "vaultPlacement": {
      "area": "建议放入的领域目录，例如 Investing / AI-Research / Programming / Tools",
      "moc": "建议关联的 MOC 名称，例如 MOC-Investing",
      "filename": "建议保存的 Markdown 文件名，以 .md 结尾",
      "tags": ["tag1", "tag2", "tag3"]
    },
    "evergreenCandidates": [
      {
        "concept": "可提炼的 Evergreen 概念 1",
        "definition": "一句话定义",
        "links": ["[[相关概念A]]", "[[相关概念B]]"]
      },
      {
        "concept": "可提炼的 Evergreen 概念 2",
        "definition": "一句话定义",
        "links": ["[[相关概念A]]", "[[相关概念B]]"]
      }
    ],
    "noteMarkdown": "输出一份可直接保存进 Obsidian 的 Markdown 笔记全文，包含 frontmatter、标题、核心命题、主题模块、实践结论、关联知识。"
  }
}

每条观点卡片要求：一句话一个观点，尽量具体，优先提炼原书独特的方法、模型、案例或判断框架。

读书流水线拆书要求：
- coreQuestion 必须是一个真正能驱动阅读和复盘的问题，不能空泛。
- keyModels 优先写书里最关键的 3 到 5 个模型、原则或判断框架。
- keyCases 优先写最经典、最有代表性的实验、故事、历史事件或投资案例。
- transferScenarios 要尽量贴近现实决策，比如投资、管理、产品、学习、择业、谈判、写作。
- actionChecklist 写成可以立即执行的动作，不要写成抽象口号。
- alphaNotes 要像可直接放进知识库的短笔记，简洁但有判断力。

费曼学习解释要求：
- 这部分的目标不是再总结一遍，而是形成一个“能用费曼解释讲给另一个人听”的内容范式。
- authorContext 写 1 到 2 段，说明作者是谁、什么背景、为什么会在那个时间点写这本书、这本书是对什么现实问题或思想潮流的回应。让读者明白作者不是凭空写作，而是带着自己的问题意识。
- explanationAngles 设计 3 到 5 个最可能被外行追问的角度，直接用小标题点出每个角度的关键词，然后用大白话讲清楚。不要写“朋友问”这种对话格式，就是连续的小节式讲解。
- 角度要随书的主题变化，不要套用固定模板。哲学/思想类可讲“它反对什么、论证从哪一步开始”；方法论/工具类可讲“怎么用、用错了会怎样”；历史/社会科学类可讲“为什么是 A 不是 B、不同地区/时代的对比”；心理学/认知类可讲“跟日常直觉哪里不一样、机制是什么”；商业/管理类可讲“小规模适用吗、跟其他理论冲突吗”。
- explanationAngles 之间要有递进感：先讲“是什么”，再讲“为什么”，最后落到“跟读者有什么关系”。
- oneSentenceSummary 用一句有力量的话收尾，句式可参考：“作者写这本书是想告诉你：XXX，这个道理对 A 成立，对 B 也成立”。

Markdown 笔记要求：
- 包含 frontmatter
- frontmatter 至少包含 title、author、type、field、tags
- 正文里包含“核心命题 / 读书流水线拆书 / 主题模块 / 阅读后可直接带走的结论 / 费曼学习解释 / 关联知识”
- 关联知识里请使用 Obsidian 风格双向链接，例如 [[MOC-Investing]]
- 不要输出占位符，要输出可直接保存的完整内容`,
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
              feynmanExplanation: {
                type: Type.OBJECT,
                properties: {
                  authorContext: { type: Type.ARRAY, items: { type: Type.STRING } },
                  explanationAngles: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        title: { type: Type.STRING },
                        explanation: { type: Type.STRING }
                      },
                      required: ["title", "explanation"]
                    }
                  },
                  oneSentenceSummary: { type: Type.STRING }
                },
                required: ["authorContext", "explanationAngles", "oneSentenceSummary"]
              },
              readingPipeline: {
                type: Type.OBJECT,
                properties: {
                  coreQuestion: { type: Type.STRING },
                  keyModels: { type: Type.ARRAY, items: { type: Type.STRING } },
                  keyCases: { type: Type.ARRAY, items: { type: Type.STRING } },
                  transferScenarios: { type: Type.ARRAY, items: { type: Type.STRING } },
                  actionChecklist: { type: Type.ARRAY, items: { type: Type.STRING } },
                  alphaNotes: { type: Type.ARRAY, items: { type: Type.STRING } }
                },
                required: ["coreQuestion", "keyModels", "keyCases", "transferScenarios", "actionChecklist", "alphaNotes"]
              },
              displaySuggestions: { type: Type.STRING },
              obsidianPipeline: {
                type: Type.OBJECT,
                properties: {
                  vaultPlacement: {
                    type: Type.OBJECT,
                    properties: {
                      area: { type: Type.STRING },
                      moc: { type: Type.STRING },
                      filename: { type: Type.STRING },
                      tags: { type: Type.ARRAY, items: { type: Type.STRING } }
                    },
                    required: ["area", "moc", "filename", "tags"]
                  },
                  evergreenCandidates: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        concept: { type: Type.STRING },
                        definition: { type: Type.STRING },
                        links: { type: Type.ARRAY, items: { type: Type.STRING } }
                      },
                      required: ["concept", "definition", "links"]
                    }
                  },
                  noteMarkdown: { type: Type.STRING }
                },
                required: ["vaultPlacement", "evergreenCandidates", "noteMarkdown"]
              }
            },
            required: ["positioning", "coreProposition", "modules", "conclusions", "feynmanExplanation", "readingPipeline", "displaySuggestions", "obsidianPipeline"]
          }
        }
      });

      const rawData = JSON.parse(response.text || '{}');
      const newBook: BookData = {
        ...rawData,
        feynmanExplanation:
          normalizeFeynmanExplanation(rawData.feynmanExplanation, rawData.positioning?.title || bookTitle),
        readingPipeline:
          rawData.readingPipeline ??
          createFallbackReadingPipeline(rawData.positioning?.title || bookTitle),
        id: crypto.randomUUID(),
        timestamp: Date.now()
      };
      
      setResult(newBook);
      await saveHistoryBook(newBook);
      if (storageMode === 'ima') {
        await syncBookDirect(newBook);
      } else {
        await stagePipelineChangeForReview(newBook);
      }
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

  const clearHistory = async () => {
    if (!confirm('确定要清空所有记录吗？')) return;

    try {
      const response = await fetch('/api/history', {
        method: 'DELETE',
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || '清空已拆解目录失败。');
      }

      setHistory([]);
      localStorage.removeItem('bookmind_history');
    } catch (historyError) {
      console.error(historyError);
    }
  };

  const reviewedCount = readingDatabase.length;
  const decodedCount = readingDatabase.filter((item) => item.stage !== 'Inbox').length;
  const vaultReadyCount = readingDatabase.filter((item) => item.stage === 'Vault').length;

  return (
    <div className="bookmind-shell min-h-screen text-[var(--ink)] selection:bg-[#d9fbe9] selection:text-[#161514] flex">
      <div className="page-backdrop" aria-hidden="true" />
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
              className="glass-sidebar fixed inset-y-0 left-0 w-72 z-[70] shadow-2xl lg:shadow-none lg:relative lg:flex flex-col"
            >
              <div className="p-6 border-b border-[var(--line)] flex items-center justify-between">
                <h2 className="font-bold text-[var(--ink)] flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-[var(--blue)]" />
                  已拆解目录
                </h2>
                <button 
                  onClick={() => setIsSidebarOpen(false)}
                  className="lg:hidden p-1 hover:bg-black/5 rounded-md"
                >
                  <ArrowRight className="w-4 h-4 rotate-180" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {historyLoading ? (
                  <div className="text-center py-10 text-gray-400 text-sm">
                    正在读取已拆解目录...
                  </div>
                ) : history.length === 0 ? (
                  <div className="text-center py-10 text-gray-400 text-sm">
                    暂无搜索记录
                  </div>
                ) : (
                  history.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => selectFromHistory(item)}
                      className={cn(
                        "w-full text-left p-3 rounded-2xl transition-all group",
                        result?.id === item.id
                          ? "bg-[var(--blue-soft)] text-[var(--blue)] border border-[#cfe3ff]"
                          : "hover:bg-white/70 text-[var(--muted)] border border-transparent"
                      )}
                    >
                      <div className="font-semibold text-sm truncate mb-1 group-hover:text-[var(--blue)]">
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
                <div className="p-4 border-t border-[var(--line)]">
                  <button 
                    onClick={clearHistory}
                    className="w-full py-2 text-xs text-red-500 hover:bg-red-50 rounded-xl transition-colors font-medium"
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
        <header className="topbar-glass sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 h-[72px] flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="p-2 hover:bg-black/5 rounded-2xl transition-colors relative"
              >
                <Layout className="w-5 h-5 text-[var(--muted)]" />
                {history.length > 0 && !isSidebarOpen && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-[var(--brand)] rounded-full border-2 border-white" />
                )}
              </button>
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 bg-[var(--ink)] rounded-2xl flex items-center justify-center shadow-[0_8px_18px_rgba(31,29,26,0.12)]">
                  <BookMarked className="text-white w-5 h-5" />
                </div>
                <div>
                  <div className="mono-label text-[var(--muted-soft)]">AI-Native Reading OS</div>
                  <span className="font-semibold text-lg tracking-tight">James Reading OS</span>
                </div>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-6 text-sm font-medium text-[var(--muted)]">
              <a href="#positioning" className="hover:text-[var(--brand-deep)] transition-colors">书籍定位</a>
              <a href="#core-proposition" className="hover:text-[var(--brand-deep)] transition-colors">核心命题</a>
              <a href="#theme-modules" className="hover:text-[var(--brand-deep)] transition-colors">主题模块</a>
              <a href="#conclusions" className="hover:text-[var(--brand-deep)] transition-colors">实操结论</a>
            </div>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-4 py-10 md:py-14">
        {/* Search Section */}
        <section className="mb-16">
          <div className="hero-panel px-6 py-8 md:px-10 md:py-12 lg:px-14 lg:py-14 text-center">
          <div className="section-kicker mono-label mx-auto mb-6">AI-Native Learning Loop</div>
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="display-title text-5xl md:text-6xl lg:text-7xl font-semibold mb-6 text-[var(--ink)]"
          >
            一本书到知识资产
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-lg md:text-xl text-[var(--muted)] mb-10 max-w-3xl mx-auto leading-8"
          >
            输入一本书，生成拆书内容、NotebookLM 素材、Gemini 深聊问题与知识库沉淀记录，把阅读变成可复用的个人判断力资产。
          </motion.p>

          <motion.form 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            onSubmit={handleGenerate}
            className="hero-search relative max-w-3xl mx-auto rounded-[28px] p-2.5"
          >
            <input
              type="text"
              value={bookTitle}
              onChange={(e) => setBookTitle(e.target.value)}
              placeholder="输入书名，例如：《证券分析》"
              className="w-full h-16 pl-14 pr-36 bg-transparent rounded-[24px] outline-none text-lg text-[var(--ink)] placeholder:text-[var(--muted-soft)]"
            />
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-[var(--muted-soft)] w-6 h-6" />
            <button
              type="submit"
              disabled={loading || !bookTitle.trim()}
              className="absolute right-2 top-2 bottom-2 px-6 bg-[var(--ink)] text-white rounded-[20px] font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 shadow-[0_10px_24px_rgba(31,29,26,0.12)]"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
              <span>开始拆解</span>
            </button>
          </motion.form>

          {storageMode === 'ima' && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="mt-5 max-w-3xl mx-auto surface-card rounded-[28px] p-4 md:p-5 text-left"
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <div className="inline-flex px-3 py-1 bg-[var(--brand-soft)] text-[var(--brand-deep)] text-xs font-bold uppercase tracking-wider rounded-full mb-2">
                    默认同步目标
                  </div>
                  <p className="text-sm md:text-base text-[var(--ink)] font-semibold">
                    本次拆书确认后，会默认写入 `James的读书分享` 知识库
                  </p>
                  <p className="text-sm text-[var(--muted)] mt-1">
                    系统会自动查重并直接创建或追加到 ima，同时在本地 `书本` 文件夹下按书名保存一份。
                  </p>
                </div>
                <a
                  href="https://ima.qq.com/"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center px-4 py-2 bg-white text-[var(--brand-deep)] border border-[#cdebd8] rounded-full font-medium hover:bg-[var(--brand-soft)] transition-colors"
                >
                  打开 ima 知识库
                </a>
              </div>
            </motion.div>
          )}
          </div>
        </section>

        {pendingPipelineChange && (
          <section className="mb-12 surface-card rounded-[28px] p-6 md:p-8">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-[var(--amber-soft)] text-[#9a6700] text-xs font-bold uppercase tracking-wider rounded-full mb-3">
                  <AlertCircle className="w-3.5 h-3.5" />
                  更新前确认
                </div>
                <h2 className="display-title text-2xl md:text-3xl font-semibold text-[var(--ink)]">这次准备写入读书流水线的内容</h2>
                <p className="text-[var(--muted)] mt-2 leading-relaxed max-w-3xl">
                  系统不会直接修改数据库。先把本次准备新增或更新的字段列给你看，只有点确认后才会真正写入当前数据源。
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                {pendingPipelineChange.action !== 'noop' && (
                  <button
                    onClick={confirmPipelineChange}
                    disabled={storageSyncing}
                    className="px-5 py-2.5 bg-[var(--ink)] text-white rounded-full font-medium hover:opacity-90 transition-colors"
                  >
                    {storageSyncing
                      ? '正在写入...'
                      : storageMode === 'notion'
                        ? '确认同步到 Notion'
                        : storageMode === 'ima'
                          ? '确认写入 James的读书分享'
                          : '确认写入本地数据库'}
                  </button>
                )}
                <button
                  onClick={cancelPipelineChange}
                  disabled={storageSyncing}
                  className="px-5 py-2.5 bg-white text-[var(--muted)] border border-[var(--line-strong)] rounded-full font-medium hover:bg-black/[0.03] transition-colors"
                >
                  暂不处理
                </button>
              </div>
            </div>

            <div className="mb-4">
              <span
                className={cn(
                  "inline-flex px-3 py-1 rounded-full text-xs font-semibold",
                  pendingPipelineChange.action === 'create'
                    ? "bg-emerald-100 text-emerald-700"
                    : pendingPipelineChange.action === 'update'
                      ? "bg-blue-100 text-blue-700"
                      : "bg-gray-200 text-gray-700",
                )}
              >
                {pendingPipelineChange.action === 'create'
                  ? '新增一本书'
                  : pendingPipelineChange.action === 'update'
                    ? '更新现有记录'
                    : '无需更新'}
              </span>
            </div>

            {pendingPipelineChange.existing && (
              <div className="text-sm text-[var(--muted)] mb-4">
                已匹配到现有记录：<span className="font-medium text-[var(--ink)]">{pendingPipelineChange.existing.title}</span>
              </div>
            )}

            {pendingPipelineChange.changes.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm bg-white rounded-[24px] overflow-hidden border border-[var(--line)]">
                  <thead className="bg-[var(--paper-strong)] text-[var(--muted)]">
                    <tr className="text-left">
                      <th className="px-4 py-3 font-semibold">字段</th>
                      <th className="px-4 py-3 font-semibold">当前值</th>
                      <th className="px-4 py-3 font-semibold">准备写入</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingPipelineChange.changes.map((change) => (
                      <tr key={change.field} className="border-t border-[var(--line)]">
                        <td className="px-4 py-3 font-medium text-[var(--ink)]">{change.field}</td>
                        <td className="px-4 py-3 text-[var(--muted)]">{change.from || '空'}</td>
                        <td className="px-4 py-3 text-[var(--ink)]">{change.to || '空'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="bg-white rounded-[24px] border border-[var(--line)] p-5 text-[var(--muted)]">
                规范书名匹配后，系统判断这本书已经存在且当前字段没有需要修改的内容，所以这次不会重复写入。
              </div>
            )}
          </section>
        )}

        <section className="mb-16 space-y-6">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <div className="section-kicker mb-3">
                {storageMode === 'notion'
                  ? 'Notion Reading Pipeline DB'
                  : storageMode === 'ima'
                    ? 'IMA Reading Pipeline DB'
                    : 'Local Reading Pipeline DB'}
              </div>
              <h2 className="display-title text-3xl md:text-4xl font-semibold text-[var(--ink)]">读书流水线数据库</h2>
              <p className="text-[var(--muted)] mt-2 max-w-3xl leading-relaxed">
                现在这张表直接读取当前数据源里的真实数据。每次你完成一本书的拆解，系统会先查重，再把准备写入的字段列出来，只有你确认后才会更新数据库和页面内容。
              </p>
              <p className="text-xs text-[var(--muted-soft)] mt-3 max-w-3xl leading-relaxed">
                去重规则：按规范书名匹配，自动忽略《》、中英文标点、空格等格式差异；同一本书再次出现时只升级状态，不重复新增记录。
              </p>
            </div>
            <div className="text-sm text-[var(--muted-soft)]">
              数据源：{storageLabel}
            </div>
          </div>

          {storageMessage && (
            <div
              className={cn(
                "rounded-[24px] border p-4 text-sm leading-relaxed",
                storageConfigured
                  ? "bg-[var(--brand-soft)] border-[#caecd8] text-[var(--brand-deep)]"
                  : "bg-[var(--amber-soft)] border-[#f2e0b7] text-[#9a6700]",
              )}
            >
              {storageMessage}
            </div>
          )}

          <div className="grid md:grid-cols-3 gap-4">
            <div className="surface-card rounded-[24px] p-5">
              <div className="mono-label text-[var(--muted-soft)] mb-2">Reviewed</div>
              <div className="text-3xl font-semibold text-[var(--ink)]">{reviewedCount}</div>
            </div>
            <div className="surface-card rounded-[24px] p-5">
              <div className="mono-label text-[var(--muted-soft)] mb-2">Decoded</div>
              <div className="text-3xl font-semibold text-[var(--blue)]">{decodedCount}</div>
            </div>
            <div className="surface-card rounded-[24px] p-5">
              <div className="mono-label text-[var(--muted-soft)] mb-2">Vault Ready</div>
              <div className="text-3xl font-semibold text-[var(--brand-deep)]">{vaultReadyCount}</div>
            </div>
          </div>

          <div className="table-shell rounded-[28px] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-sm">
                <thead className="bg-[rgba(246,244,239,0.92)] text-[var(--muted)]">
                  <tr className="text-left">
                    <th className="px-5 py-4 font-semibold">书名</th>
                    <th className="px-5 py-4 font-semibold">学科分类</th>
                    <th className="px-5 py-4 font-semibold">当前工序</th>
                    <th className="px-5 py-4 font-semibold">核心问题记录</th>
                    <th className="px-5 py-4 font-semibold">Alpha笔记</th>
                    <th className="px-5 py-4 font-semibold">最近更新</th>
                  </tr>
                </thead>
                <tbody>
                  {databaseLoading ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-10 text-center text-[var(--muted-soft)]">
                        正在读取 Notion 读书流水线...
                      </td>
                    </tr>
                  ) : readingDatabase.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-10 text-center text-[var(--muted-soft)]">
                        暂无可展示的 Notion 记录
                      </td>
                    </tr>
                  ) : readingDatabase.map((item) => (
                    <tr key={item.id} className="border-t border-[var(--line)] hover:bg-white/60 transition-colors">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-[var(--ink)]">{item.title}</div>
                        {storageMode === 'notion' && item.pageUrl && (
                          <a
                            href={item.pageUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-[var(--blue)] hover:underline mt-1 inline-block"
                          >
                            打开 Notion 页面
                          </a>
                        )}
                      </td>
                      <td className="px-5 py-4 text-[var(--muted)]">{item.field}</td>
                      <td className="px-5 py-4">
                        <span
                          className={cn(
                            "inline-flex px-2.5 py-1 rounded-full text-xs font-semibold",
                            item.notionProcess === '✅ 已完成'
                              ? "bg-[var(--brand-soft)] text-[var(--brand-deep)]"
                              : item.notionProcess === '💡Alpha笔记'
                                ? "bg-[var(--blue-soft)] text-[var(--blue)]"
                                : item.notionProcess === '⚔️ AI对谈'
                                  ? "bg-[var(--violet-soft)] text-violet-700"
                                  : "bg-[var(--amber-soft)] text-[#9a6700]",
                          )}
                        >
                          {item.notionProcess || item.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-[var(--muted)] max-w-[280px] align-top">
                        <div className="max-h-24 overflow-hidden whitespace-pre-wrap">{item.coreQuestionNotes || '—'}</div>
                      </td>
                      <td className="px-5 py-4 text-[var(--muted)] max-w-[280px] align-top">
                        <div className="max-h-24 overflow-hidden whitespace-pre-wrap">{item.alphaNotes || '—'}</div>
                      </td>
                      <td className="px-5 py-4 text-[var(--muted-soft)] whitespace-nowrap">
                        {new Date(item.lastReviewedAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
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
                <div className="absolute inset-0 border-4 border-[var(--brand-soft)] rounded-full"></div>
                <div className="absolute inset-0 border-4 border-[var(--brand)] rounded-full border-t-transparent animate-spin"></div>
              </div>
              <p className="text-[var(--brand-deep)] font-medium animate-pulse">{loadingMessage}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-[22px] text-center mb-8">
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
            <section id="positioning" className="surface-card rounded-[32px] p-8 md:p-12">
              <div className="flex items-center gap-3 mb-8">
                <div className="section-kicker">
                  一、书籍定位
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-8">
                <div className="min-w-0">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-4">
                    <h2 className="display-title text-4xl md:text-5xl font-semibold text-[var(--ink)] break-words">
                      {result.positioning.title}
                    </h2>
                    <button
                      type="button"
                      onClick={() => copyBookContent(result)}
                      className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-full border border-[var(--line-strong)] bg-white px-4 py-2 text-sm font-medium text-[var(--ink)] transition-colors hover:bg-[var(--paper-strong)]"
                      title="复制这本书的完整拆书内容"
                    >
                      <Copy className="w-4 h-4 text-[var(--brand-deep)]" />
                      {copiedContentId === result.id ? '已复制' : '复制内容'}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-3 mb-6">
                    <span className="px-3 py-1 bg-white/80 text-[var(--muted)] text-sm rounded-full font-medium border border-[var(--line)]">
                      作者：{result.positioning.author}
                    </span>
                    <span className="px-3 py-1 bg-white/80 text-[var(--muted)] text-sm rounded-full font-medium border border-[var(--line)]">
                      领域：{result.positioning.field}
                    </span>
                  </div>
                </div>
                <div className="flex items-center">
                  <div className="quote-surface p-6 rounded-[24px] border-l-4 border-[var(--brand)] italic text-[var(--muted)] leading-relaxed">
                    “{result.positioning.oneLiner}”
                  </div>
                </div>
              </div>
            </section>

            {/* 2. Core Proposition */}
            <section id="core-proposition" className="surface-card rounded-[32px] text-center py-12 px-6 md:px-10">
              <div className="inline-block section-kicker mb-6">
                二、核心命题
              </div>
              <h3 className="display-title text-4xl md:text-5xl lg:text-6xl font-semibold mb-8 text-[var(--ink)] leading-tight">
                {result.coreProposition.mainTitle}
              </h3>
              <div className="max-w-3xl mx-auto space-y-4">
                {result.coreProposition.explanation.map((exp, idx) => (
                  <p key={idx} className="text-lg text-[var(--muted)] leading-relaxed">
                    {exp}
                  </p>
                ))}
              </div>
            </section>

            {/* 3. Theme Modules */}
            <section id="theme-modules" className="space-y-8">
              <div className="flex items-center gap-3">
                <div className="section-kicker">
                  三、主题模块
                </div>
              </div>
              <div className="grid md:grid-cols-3 gap-6">
                {result.modules.map((module, mIdx) => (
                  <div key={mIdx} className="surface-card-strong rounded-[28px] p-6 hover:-translate-y-0.5 transition-all">
                    <div className="flex items-center gap-2 mb-6">
                      <div className="w-9 h-9 bg-[var(--paper-strong)] rounded-2xl flex items-center justify-center border border-[var(--line)]">
                        {mIdx === 0 ? <Target className="w-4 h-4 text-[var(--brand-deep)]" /> :
                         mIdx === 1 ? <Layers className="w-4 h-4 text-[var(--brand-deep)]" /> :
                         <Zap className="w-4 h-4 text-[var(--brand-deep)]" />}
                      </div>
                      <h4 className="font-bold text-[var(--ink)]">{module.title}</h4>
                    </div>
                    <ul className="space-y-4">
                      {module.cards.map((card, cIdx) => (
                        <li key={cIdx} className="flex gap-3 text-sm text-[var(--muted)] leading-relaxed">
                          <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[var(--brand)] shrink-0" />
                          {card}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>

            {/* 4. Reading Pipeline */}
            <section className="surface-card rounded-[32px] p-8 md:p-10">
              <div className="flex items-center gap-3 mb-8">
                <div className="section-kicker">
                  四、读书流水线拆书
                </div>
              </div>

              <div className="grid lg:grid-cols-[1.1fr,0.9fr] gap-6 mb-6">
                <div className="rounded-[26px] bg-[var(--violet-soft)] border border-[#ddd4ff] p-6">
                  <div className="mono-label text-violet-700 mb-3">这本书真正回答的问题</div>
                  <p className="text-xl md:text-2xl font-semibold text-[var(--ink)] leading-relaxed">
                    {result.readingPipeline.coreQuestion}
                  </p>
                </div>

                <div className="rounded-[26px] bg-white border border-[var(--line)] p-6">
                  <div className="mono-label text-[var(--muted-soft)] mb-4">行动清单</div>
                  <ul className="space-y-3">
                    {result.readingPipeline.actionChecklist.map((item, idx) => (
                      <li key={idx} className="flex gap-3 text-sm text-[var(--muted)] leading-relaxed">
                        <span className="w-6 h-6 rounded-full bg-[var(--paper-strong)] text-violet-700 text-xs font-bold flex items-center justify-center shrink-0 border border-[var(--line)]">
                          {idx + 1}
                        </span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-5">
                <div className="rounded-[24px] border border-[var(--line)] p-5 bg-white">
                  <h5 className="font-bold text-[var(--ink)] mb-4 flex items-center gap-2">
                    <Target className="w-4 h-4 text-violet-600" />
                    关键模型
                  </h5>
                  <ul className="space-y-3">
                    {result.readingPipeline.keyModels.map((item, idx) => (
                      <li key={idx} className="text-sm text-[var(--muted)] leading-relaxed flex gap-3">
                        <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-violet-600 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-[24px] border border-[var(--line)] p-5 bg-white">
                  <h5 className="font-bold text-[var(--ink)] mb-4 flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-violet-600" />
                    代表性案例
                  </h5>
                  <ul className="space-y-3">
                    {result.readingPipeline.keyCases.map((item, idx) => (
                      <li key={idx} className="text-sm text-[var(--muted)] leading-relaxed flex gap-3">
                        <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-violet-600 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-[24px] border border-[var(--line)] p-5 bg-white">
                  <h5 className="font-bold text-[var(--ink)] mb-4 flex items-center gap-2">
                    <ArrowRight className="w-4 h-4 text-violet-600" />
                    迁移场景
                  </h5>
                  <ul className="space-y-3">
                    {result.readingPipeline.transferScenarios.map((item, idx) => (
                      <li key={idx} className="text-sm text-[var(--muted)] leading-relaxed flex gap-3">
                        <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-violet-600 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-[24px] border border-[var(--line)] p-5 bg-white">
                  <h5 className="font-bold text-[var(--ink)] mb-4 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-violet-600" />
                    Alpha 笔记
                  </h5>
                  <ul className="space-y-3">
                    {result.readingPipeline.alphaNotes.map((item, idx) => (
                      <li key={idx} className="text-sm text-[var(--muted)] leading-relaxed flex gap-3">
                        <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-violet-600 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>

            {/* 5. Conclusions */}
            <section id="conclusions" className="deep-panel rounded-[32px] p-8 md:p-12 text-white">
              <div className="flex items-center gap-3 mb-10">
                <div className="section-kicker border-white/10 bg-white/5 text-white/70">
                  五、阅读后可直接带走的结论
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
                        <span className="text-emerald-300 font-bold">0{idx + 1}</span>
                        <span className="text-stone-200">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-6">
                  <h5 className="text-xl font-bold flex items-center gap-2">
                    <ArrowRight className="w-5 h-5 text-emerald-300" />
                    现实中如何应用
                  </h5>
                  <div className="p-6 bg-white/8 rounded-[24px] font-medium leading-relaxed border border-white/10">
                    {result.conclusions.practicalUse}
                  </div>
                </div>
              </div>
            </section>

            {/* 6. Feynman Explanation */}
            <section className="surface-card rounded-[32px] p-8 md:p-10">
              <div className="flex items-center gap-3 mb-8">
                <div className="section-kicker">
                  六、费曼学习解释
                </div>
              </div>
              <div className="rounded-[26px] bg-white border border-[var(--line)] p-6 mb-6">
                <div className="mono-label text-[var(--muted-soft)] mb-4">作者和时代背景</div>
                <div className="space-y-4">
                  {result.feynmanExplanation.authorContext.map((item, idx) => (
                    <p key={idx} className="text-[var(--muted)] leading-7">
                      {item}
                    </p>
                  ))}
                </div>
              </div>
              <div className="rounded-[26px] bg-[var(--paper-strong)] border border-[var(--line)] p-6">
                <h5 className="font-bold text-[var(--ink)] mb-4 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[var(--brand-deep)]" />
                  用大白话讲给一个没读过这本书的朋友听
                </h5>
                <div className="grid md:grid-cols-2 gap-4">
                  {result.feynmanExplanation.explanationAngles.map((angle, idx) => (
                    <article key={idx} className="rounded-[20px] bg-white border border-[var(--line)] p-5">
                      <h6 className="font-semibold text-[var(--ink)] mb-3">{angle.title}</h6>
                      <p className="text-sm text-[var(--muted)] leading-relaxed">
                        {angle.explanation}
                      </p>
                    </article>
                  ))}
                </div>
              </div>
              <div className="mt-6 rounded-[26px] quote-surface p-6 border-l-4 border-[var(--brand)]">
                <div className="mono-label text-[var(--brand-deep)] mb-3">一句话总结</div>
                <p className="text-lg font-semibold text-[var(--ink)] leading-8">
                  {result.feynmanExplanation.oneSentenceSummary}
                </p>
              </div>
            </section>

            {/* 6. Display Suggestions */}
            <section className="surface-card rounded-[28px] p-8">
              <div className="flex items-center gap-3 mb-6">
                <MousePointer2 className="w-5 h-5 text-[var(--blue)]" />
                <h5 className="font-bold text-[var(--ink)]">页面展示建议</h5>
              </div>
              <p className="text-[var(--muted)] leading-relaxed">
                {result.displaySuggestions}
              </p>
            </section>

            {/* 7. Obsidian Vault Pipeline */}
            <section className="surface-card rounded-[32px] p-8 md:p-10">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="section-kicker bg-[var(--brand-soft)] text-[var(--brand-deep)] border-[#cdebd8]">
                      七、Obsidian Vault Pipeline
                    </div>
                  </div>
                  <h5 className="display-title text-3xl font-semibold text-[var(--ink)]">把书籍拆解结果直接沉淀进知识库</h5>
                  <p className="text-[var(--muted)] mt-2 leading-relaxed">
                    参考 Obsidian Vault Pipeline 的“解读 → 提炼 → 索引”思路，下面是可直接进入 vault 的结构化输出。
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => copyToClipboard(result.obsidianPipeline.noteMarkdown)}
                    className="px-4 py-2 bg-white text-[var(--brand-deep)] border border-[#cdebd8] rounded-full font-medium hover:bg-[var(--brand-soft)] transition-colors flex items-center gap-2"
                  >
                    <Copy className="w-4 h-4" />
                    复制 Markdown
                  </button>
                  <button
                    onClick={() => downloadMarkdown(result)}
                    className="px-4 py-2 bg-[var(--ink)] text-white rounded-full font-medium hover:opacity-90 transition-colors flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    下载笔记
                  </button>
                </div>
              </div>

              <div className="grid lg:grid-cols-[0.9fr,1.1fr] gap-6 mb-6">
                <div className="bg-white rounded-[24px] border border-[#cdebd8] p-6">
                  <h6 className="font-bold text-[var(--ink)] flex items-center gap-2 mb-4">
                    <Network className="w-4 h-4 text-[var(--brand-deep)]" />
                    Vault 落点建议
                  </h6>
                  <div className="space-y-3 text-sm text-[var(--ink)]">
                    <div className="flex justify-between gap-4">
                      <span className="text-[var(--muted)]">Area</span>
                      <span className="font-medium text-right">{result.obsidianPipeline.vaultPlacement.area}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-[var(--muted)]">MOC</span>
                      <span className="font-medium text-right">{result.obsidianPipeline.vaultPlacement.moc}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-[var(--muted)]">文件名</span>
                      <span className="font-medium text-right break-all">{result.obsidianPipeline.vaultPlacement.filename}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-5">
                    {result.obsidianPipeline.vaultPlacement.tags.map((tag, idx) => (
                      <span key={idx} className="px-3 py-1 bg-[var(--brand-soft)] text-[var(--brand-deep)] rounded-full text-xs font-medium">
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-[24px] border border-[#cdebd8] p-6">
                  <h6 className="font-bold text-[var(--ink)] flex items-center gap-2 mb-4">
                    <BookOpen className="w-4 h-4 text-[var(--brand-deep)]" />
                    Evergreen 候选概念
                  </h6>
                  <div className="space-y-4">
                    {result.obsidianPipeline.evergreenCandidates.map((candidate, idx) => (
                      <div key={idx} className="p-4 rounded-[20px] bg-[var(--brand-soft)] border border-[#d8efe1]">
                        <div className="font-semibold text-[var(--ink)] mb-2">{candidate.concept}</div>
                        <p className="text-sm text-[var(--muted)] leading-relaxed mb-3">{candidate.definition}</p>
                        <div className="flex flex-wrap gap-2">
                          {candidate.links.map((link, linkIdx) => (
                            <span key={linkIdx} className="px-2.5 py-1 bg-white border border-[#cdebd8] rounded-full text-xs text-[var(--brand-deep)]">
                              {link}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="markdown-panel rounded-[24px] p-6">
                <h6 className="font-bold text-white flex items-center gap-2 mb-4">
                  <FileText className="w-4 h-4 text-emerald-300" />
                  可直接保存的 Obsidian Markdown
                </h6>
                <pre className="text-sm leading-7 text-slate-200 whitespace-pre-wrap break-words overflow-x-auto">
                  {result.obsidianPipeline.noteMarkdown}
                </pre>
              </div>
            </section>

            {/* Footer CTA */}
            <footer className="text-center py-12 section-divider">
              <p className="text-[var(--muted-soft)] text-sm mb-4">由 James Reading OS AI 深度提炼</p>
              <button 
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="text-[var(--blue)] font-semibold hover:underline"
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
