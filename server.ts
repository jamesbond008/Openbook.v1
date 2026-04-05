import express from 'express';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';

dotenv.config({path: '.env.local'});
dotenv.config();

const app = express();
app.use(express.json({limit: '2mb'}));

const PORT = Number(process.env.API_PORT || 3001);
const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_API_VERSION = '2022-06-28';
const DEFAULT_NOTION_DATABASE_ID = '2f943573-54aa-806d-82eb-d5e7ef5f0b51';
const STORAGE_MODE = (process.env.BOOKMIND_STORAGE_MODE || 'local').toLowerCase();
const LOCAL_DB_PATH = path.resolve(process.cwd(), 'data', 'reading-pipeline.json');
const BOOK_LIBRARY_DIR = path.resolve(process.cwd(), '书本');
const IMA_API_BASE = 'https://ima.qq.com';
const DEFAULT_IMA_KNOWLEDGE_BASE_ID = '5enW5PsrQcchOKPeeaC8Z_WD20yeHbXxRK6R9-Zk_q4=';
const DEFAULT_IMA_KNOWLEDGE_BASE_NAME = 'James的读书分享';

type NotionProcess = '📥 输入阶段' | '⚔️ AI对谈' | '💡Alpha笔记' | '✅ 已完成';
type ReadingStatus = '已查阅' | '已拆解' | '可入库';
type ReadingStage = 'Inbox' | 'Decode' | 'Vault';

type BookData = {
  id?: string;
  timestamp?: number;
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
  modules: Array<{
    title: string;
    cards: string[];
  }>;
  conclusions: {
    remember: string[];
    practicalUse: string;
  };
  readingPipeline: {
    coreQuestion: string;
    keyModels: string[];
    keyCases: string[];
    transferScenarios: string[];
    actionChecklist: string[];
    alphaNotes: string[];
  };
  obsidianPipeline?: {
    vaultPlacement?: {
      moc?: string;
    };
    noteMarkdown?: string;
  };
};

type ReadingPipelineRecord = {
  id: string;
  title: string;
  dedupeKey: string;
  author: string;
  field: string;
  status: ReadingStatus;
  stage: ReadingStage;
  notionProcess: NotionProcess;
  source: string;
  lastReviewedAt: number;
  moc: string;
  filename: string;
  tags: string[];
  coreQuestionNotes?: string;
  alphaNotes?: string;
  pageUrl?: string;
  imaDocId?: string;
  imaMediaId?: string;
  knowledgeBaseId?: string;
};

type PendingFieldChange = {
  field: string;
  from: string;
  to: string;
};

type PendingPipelineChange = {
  action: 'create' | 'update' | 'noop';
  candidate: ReadingPipelineRecord;
  existing: ReadingPipelineRecord | null;
  changes: PendingFieldChange[];
};

type NotionQueryResponse = {
  results: any[];
  has_more: boolean;
  next_cursor: string | null;
};

type LocalDatabase = {
  records: ReadingPipelineRecord[];
  history: BookData[];
  snapshots: Array<{
    dedupeKey: string;
    title: string;
    updatedAt: number;
    book: BookData;
  }>;
};

function getNotionToken() {
  return process.env.NOTION_TOKEN || '';
}

function getNotionDatabaseId() {
  return process.env.NOTION_DATABASE_ID || DEFAULT_NOTION_DATABASE_ID;
}

function hasNotionConfig() {
  return Boolean(getNotionToken() && getNotionDatabaseId());
}

function useLocalStorageMode() {
  return STORAGE_MODE === 'local';
}

function useImaStorageMode() {
  return STORAGE_MODE === 'ima';
}

function getImaClientId() {
  return process.env.IMA_OPENAPI_CLIENTID || process.env.IMA_CLIENT_ID || '';
}

function getImaApiKey() {
  return process.env.IMA_OPENAPI_APIKEY || process.env.IMA_API_KEY || '';
}

function getImaKnowledgeBaseId() {
  return process.env.IMA_KNOWLEDGE_BASE_ID || DEFAULT_IMA_KNOWLEDGE_BASE_ID;
}

function getImaKnowledgeBaseName() {
  return process.env.IMA_KNOWLEDGE_BASE_NAME || DEFAULT_IMA_KNOWLEDGE_BASE_NAME;
}

function hasImaConfig() {
  return Boolean(getImaClientId() && getImaApiKey() && getImaKnowledgeBaseId());
}

function normalizeBookKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[《》“”"'‘’.,，。:：;；!！?？()（）\-\s]/g, '')
    .trim();
}

function sanitizeFolderName(value: string) {
  return (value || '未命名书籍')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function chunkText(value: string, maxLength = 1800) {
  const text = (value || '').trim();
  if (!text) return [];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    const slice = remaining.slice(0, maxLength);
    const lastBreak = Math.max(slice.lastIndexOf('\n'), slice.lastIndexOf('。'), slice.lastIndexOf('；'));
    const breakIndex = lastBreak > maxLength * 0.5 ? lastBreak + 1 : maxLength;
    chunks.push(remaining.slice(0, breakIndex).trim());
    remaining = remaining.slice(breakIndex).trim();
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}

function toRichText(value: string) {
  return chunkText(value).map((content) => ({
    type: 'text',
    text: {content},
  }));
}

function stringifyRecordValue(value: string | string[] | number | undefined) {
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  return String(value ?? '');
}

function notionProcessToStatus(processValue: NotionProcess): ReadingStatus {
  if (processValue === '📥 输入阶段') return '已查阅';
  if (processValue === '⚔️ AI对谈') return '已拆解';
  return '可入库';
}

function notionProcessToStage(processValue: NotionProcess): ReadingStage {
  if (processValue === '📥 输入阶段') return 'Inbox';
  if (processValue === '⚔️ AI对谈') return 'Decode';
  return 'Vault';
}

function mapFieldToDiscipline(field: string, title: string): string {
  const source = `${field} ${title}`.toLowerCase();

  if (/(投资|证券|金融|econom|market|capital|value investing|portfolio)/.test(source)) {
    return '经济学';
  }
  if (/(心理|bias|decision|behavior|认知|判断|思考|影响力)/.test(source)) {
    return '心理学';
  }
  if (/(管理|商业|战略|组织|leadership|business|company|竞争)/.test(source)) {
    return '管理学';
  }
  if (/(历史|传|简史|文明|战争|rockefeller|sapiens)/.test(source)) {
    return '历史';
  }
  if (/(数学|概率|物理|科学|系统|signal|noise|physics|darwin|gene|reality)/.test(source)) {
    return '科学';
  }
  if (/(小说|fiction|literature|三体|1984|atlas|银河系漫游指南)/.test(source)) {
    return '文学';
  }
  if (/(哲学|stoic|meditation|有限与无限的游戏|开放社会)/.test(source)) {
    return '哲学';
  }
  return '其他';
}

function buildCoreQuestionNotes(book: BookData) {
  return [
    `核心问题：${book.readingPipeline.coreQuestion}`,
    '',
    '关键模型：',
    ...book.readingPipeline.keyModels.map((item) => `- ${item}`),
    '',
    '代表性案例：',
    ...book.readingPipeline.keyCases.map((item) => `- ${item}`),
    '',
    '迁移场景：',
    ...book.readingPipeline.transferScenarios.map((item) => `- ${item}`),
  ].join('\n');
}

function buildAlphaNotes(book: BookData) {
  return [
    'Alpha 笔记：',
    ...book.readingPipeline.alphaNotes.map((item) => `- ${item}`),
    '',
    '行动清单：',
    ...book.readingPipeline.actionChecklist.map((item) => `- ${item}`),
    '',
    '最值得记住：',
    ...book.conclusions.remember.map((item) => `- ${item}`),
  ].join('\n');
}

function buildImaMarkdown(book: BookData) {
  return [
    `# ${book.positioning.title}`,
    '',
    `> ${book.positioning.author} / ${book.positioning.field}`,
    '',
    `> ${book.positioning.oneLiner}`,
    '',
    '## 核心命题',
    '',
    book.coreProposition.mainTitle,
    '',
    ...book.coreProposition.explanation.map((item) => `- ${item}`),
    '',
    '## 读书流水线拆书',
    '',
    `### 这本书真正回答的问题`,
    book.readingPipeline.coreQuestion,
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
    '### 行动清单',
    ...book.readingPipeline.actionChecklist.map((item) => `- ${item}`),
    '',
    '### Alpha 笔记',
    ...book.readingPipeline.alphaNotes.map((item) => `- ${item}`),
    '',
    '## 主题模块',
    ...book.modules.flatMap((module) => [
      '',
      `### ${module.title}`,
      ...module.cards.map((item) => `- ${item}`),
    ]),
    '',
    '## 阅读后可直接带走的结论',
    ...book.conclusions.remember.map((item) => `- ${item}`),
    '',
    book.conclusions.practicalUse,
    '',
    '## 生成信息',
    `- 生成时间：${new Date().toLocaleString('zh-CN', {hour12: false})}`,
    `- 输出来源：BookMind`,
  ].join('\n');
}

function createCandidateFromBook(book: BookData): ReadingPipelineRecord {
  const notionProcess: NotionProcess = '💡Alpha笔记';

  return {
    id: '',
    title: book.positioning.title,
    dedupeKey: normalizeBookKey(book.positioning.title),
    author: book.positioning.author,
    field: mapFieldToDiscipline(book.positioning.field, book.positioning.title),
    status: notionProcessToStatus(notionProcess),
    stage: notionProcessToStage(notionProcess),
    notionProcess,
    source: 'Notion',
    lastReviewedAt: Date.now(),
    moc: book.obsidianPipeline?.vaultPlacement?.moc || '',
    filename: '',
    tags: [],
    coreQuestionNotes: buildCoreQuestionNotes(book),
    alphaNotes: buildAlphaNotes(book),
    knowledgeBaseId: '',
  };
}

function normalizeHistoryBook(book: BookData): BookData {
  return {
    ...book,
    id: book.id || crypto.randomUUID(),
    timestamp: book.timestamp || Date.now(),
  };
}

function mergeHistoryBooks(existing: BookData[], incoming: BookData[]) {
  const map = new Map<string, BookData>();

  [...incoming, ...existing].forEach((book) => {
    const normalized = normalizeHistoryBook(book);
    const key = normalized.id || `${normalizeBookKey(normalized.positioning?.title || '')}-${normalized.timestamp}`;
    const prev = map.get(key);

    if (!prev || (normalized.timestamp || 0) >= (prev.timestamp || 0)) {
      map.set(key, normalized);
    }
  });

  return Array.from(map.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
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
        {field: '书名', from: '不存在', to: candidate.title},
        {field: '学科分类', from: '不存在', to: candidate.field},
        {field: '当前工序', from: '不存在', to: candidate.notionProcess},
        {field: '核心问题记录', from: '不存在', to: candidate.coreQuestionNotes || ''},
        {field: 'Alpha笔记', from: '不存在', to: candidate.alphaNotes || ''},
      ],
    };
  }

  const fields: Array<[string, string | string[] | number | undefined, string | string[] | number | undefined]> = [
    ['书名', existing.title, candidate.title],
    ['学科分类', existing.field, candidate.field],
    ['当前工序', existing.notionProcess, candidate.notionProcess],
    ['核心问题记录', existing.coreQuestionNotes, candidate.coreQuestionNotes],
    ['Alpha笔记', existing.alphaNotes, candidate.alphaNotes],
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

async function ensureLocalDb() {
  await fs.mkdir(path.dirname(LOCAL_DB_PATH), {recursive: true});
  try {
    await fs.access(LOCAL_DB_PATH);
  } catch {
    const initialDb: LocalDatabase = {records: [], history: [], snapshots: []};
    await fs.writeFile(LOCAL_DB_PATH, JSON.stringify(initialDb, null, 2), 'utf8');
  }
}

async function readLocalDb(): Promise<LocalDatabase> {
  await ensureLocalDb();
  const raw = await fs.readFile(LOCAL_DB_PATH, 'utf8');
  const parsed = JSON.parse(raw || '{}') as Partial<LocalDatabase>;
  return {
    records: Array.isArray(parsed.records) ? parsed.records : [],
    history: Array.isArray(parsed.history) ? mergeHistoryBooks([], parsed.history as BookData[]) : [],
    snapshots: Array.isArray(parsed.snapshots) ? parsed.snapshots : [],
  };
}

async function writeLocalDb(data: LocalDatabase) {
  await ensureLocalDb();
  await fs.writeFile(LOCAL_DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function sortRecords(records: ReadingPipelineRecord[]) {
  return [...records].sort((a, b) => b.lastReviewedAt - a.lastReviewedAt);
}

async function previewLocalBook(book: BookData) {
  const db = await readLocalDb();
  const preview = buildPendingPipelineChange(db.records, createCandidateFromBook(book));
  return {preview};
}

async function saveHistoryBook(book: BookData) {
  const db = await readLocalDb();
  const nextHistory = mergeHistoryBooks(db.history, [book]);

  await saveBookToLibrary(normalizeHistoryBook(book));

  await writeLocalDb({
    ...db,
    history: nextHistory,
  });

  return nextHistory;
}

async function clearHistoryBooks() {
  const db = await readLocalDb();
  await writeLocalDb({
    ...db,
    history: [],
  });
}

async function saveBookToLibrary(book: BookData) {
  const normalized = normalizeHistoryBook(book);
  const folderName = sanitizeFolderName(normalized.positioning?.title || '未命名书籍');
  const targetDir = path.join(BOOK_LIBRARY_DIR, folderName);

  await fs.mkdir(targetDir, {recursive: true});

  const bookJsonPath = path.join(targetDir, 'book.json');
  const markdownPath = path.join(targetDir, '拆书内容.md');
  const summaryPath = path.join(targetDir, '摘要.txt');

  const summary = [
    `书名：${normalized.positioning.title}`,
    `作者：${normalized.positioning.author}`,
    `领域：${normalized.positioning.field}`,
    '',
    `一句话：${normalized.positioning.oneLiner}`,
    '',
    `核心问题：${normalized.readingPipeline.coreQuestion}`,
  ].join('\n');

  await Promise.all([
    fs.writeFile(bookJsonPath, JSON.stringify(normalized, null, 2), 'utf8'),
    fs.writeFile(markdownPath, normalized.obsidianPipeline?.noteMarkdown || buildImaMarkdown(normalized), 'utf8'),
    fs.writeFile(summaryPath, summary, 'utf8'),
  ]);

  return {
    folderName,
    path: targetDir,
  };
}

async function syncLocalBook(book: BookData) {
  const db = await readLocalDb();
  const candidate = createCandidateFromBook(book);
  const preview = buildPendingPipelineChange(db.records, candidate);

  if (preview.action === 'noop' && preview.existing) {
    return {
      preview,
      syncedRecord: preview.existing,
    };
  }

  const timestamp = Date.now();
  const nextRecord: ReadingPipelineRecord = {
    ...(preview.existing || candidate),
    ...candidate,
    id: preview.existing?.id || crypto.randomUUID(),
    source: 'Local DB',
    lastReviewedAt: timestamp,
  };

  const nextRecords = sortRecords(
    preview.existing
      ? db.records.map((record) => (record.dedupeKey === nextRecord.dedupeKey ? nextRecord : record))
      : [nextRecord, ...db.records],
  );

  const nextSnapshots = [
    {
      dedupeKey: nextRecord.dedupeKey,
      title: nextRecord.title,
      updatedAt: timestamp,
      book,
    },
    ...db.snapshots.filter((snapshot) => snapshot.dedupeKey !== nextRecord.dedupeKey),
  ];

  await writeLocalDb({
    records: nextRecords,
    history: db.history,
    snapshots: nextSnapshots,
  });

  return {
    preview,
    syncedRecord: nextRecord,
  };
}

async function imaFetch(pathname: string, body: Record<string, unknown>) {
  const response = await fetch(`${IMA_API_BASE}/${pathname}`, {
    method: 'POST',
    headers: {
      'ima-openapi-clientid': getImaClientId(),
      'ima-openapi-apikey': getImaApiKey(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`IMA API ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  if (data.code !== 0) {
    throw new Error(`IMA API ${data.code}: ${data.msg || '请求失败'}`);
  }

  return data.data;
}

async function searchImaNoteByTitle(title: string) {
  const data = await imaFetch('openapi/note/v1/search_note_book', {
    search_type: 0,
    query_info: {title},
    start: 0,
    end: 20,
  });

  const docs = Array.isArray(data.docs) ? data.docs : [];
  return docs
    .map((item: any) => item?.doc?.basic_info)
    .find((item: any) => normalizeBookKey(item?.title || '') === normalizeBookKey(title));
}

async function searchImaKnowledgeByTitle(title: string) {
  const data = await imaFetch('openapi/wiki/v1/search_knowledge', {
    query: title,
    cursor: '',
    knowledge_base_id: getImaKnowledgeBaseId(),
  });

  const items = Array.isArray(data.info_list) ? data.info_list : [];
  return items.find((item: any) => normalizeBookKey(item?.title || '') === normalizeBookKey(title));
}

async function createImaNote(book: BookData) {
  const data = await imaFetch('openapi/note/v1/import_doc', {
    content_format: 1,
    content: buildImaMarkdown(book),
  });
  return (data.note_id || data.doc_id) as string;
}

async function appendImaNote(docId: string, book: BookData) {
  const content = [
    '',
    '---',
    '',
    `## 更新于 ${new Date().toLocaleString('zh-CN', {hour12: false})}`,
    '',
    buildImaMarkdown(book),
  ].join('\n');

  const data = await imaFetch('openapi/note/v1/append_doc', {
    doc_id: docId,
    content_format: 1,
    content,
  });
  return (data.note_id || data.doc_id || docId) as string;
}

async function addImaNoteToKnowledgeBase(docId: string, title: string) {
  const data = await imaFetch('openapi/wiki/v1/add_knowledge', {
    media_type: 11,
    title,
    knowledge_base_id: getImaKnowledgeBaseId(),
    note_info: {
      content_id: docId,
    },
  });
  return data.media_id as string;
}

async function previewImaBook(book: BookData) {
  const db = await readLocalDb();
  const localExisting =
    db.records.find((record) => record.dedupeKey === normalizeBookKey(book.positioning.title)) || null;
  const remoteExisting = await searchImaNoteByTitle(book.positioning.title);
  const candidate: ReadingPipelineRecord = {
    ...createCandidateFromBook(book),
    source: 'IMA',
    id: localExisting?.id || remoteExisting?.docid || '',
    imaDocId: localExisting?.imaDocId || remoteExisting?.docid || '',
    knowledgeBaseId: getImaKnowledgeBaseId(),
  };

  const compareBase = localExisting
    ? db.records
    : remoteExisting
      ? [
          {
            ...candidate,
            id: remoteExisting.docid,
            title: remoteExisting.title || book.positioning.title,
            source: 'IMA',
            lastReviewedAt: Number(remoteExisting.modify_time || Date.now()),
          },
        ]
      : [];

  return {
    preview: buildPendingPipelineChange(compareBase, candidate),
    remoteExisting,
    localDb: db,
  };
}

async function syncImaBook(book: BookData) {
  const {preview, remoteExisting, localDb} = await previewImaBook(book);

  if (preview.action === 'noop' && preview.existing) {
    return {
      preview,
      syncedRecord: preview.existing,
    };
  }

  let docId = preview.existing?.imaDocId || remoteExisting?.docid || '';
  if (docId) {
    await appendImaNote(docId, book);
  } else {
    docId = await createImaNote(book);
  }

  let mediaId = preview.existing?.imaMediaId || '';
  if (!mediaId) {
    const remoteKnowledge = await searchImaKnowledgeByTitle(book.positioning.title);
    mediaId = remoteKnowledge?.media_id || '';
  }
  if (!mediaId) {
    mediaId = await addImaNoteToKnowledgeBase(docId, book.positioning.title);
  }

  const timestamp = Date.now();
  const nextRecord: ReadingPipelineRecord = {
    ...(preview.existing || createCandidateFromBook(book)),
    ...createCandidateFromBook(book),
    id: preview.existing?.id || docId || crypto.randomUUID(),
    source: 'IMA',
    lastReviewedAt: timestamp,
    imaDocId: docId,
    imaMediaId: mediaId,
    knowledgeBaseId: getImaKnowledgeBaseId(),
  };

  const nextRecords = sortRecords(
    preview.existing
      ? localDb.records.map((record) => (record.dedupeKey === nextRecord.dedupeKey ? nextRecord : record))
      : [nextRecord, ...localDb.records.filter((record) => record.dedupeKey !== nextRecord.dedupeKey)],
  );

  const nextSnapshots = [
    {
      dedupeKey: nextRecord.dedupeKey,
      title: nextRecord.title,
      updatedAt: timestamp,
      book,
    },
    ...localDb.snapshots.filter((snapshot) => snapshot.dedupeKey !== nextRecord.dedupeKey),
  ];

  await writeLocalDb({
    records: nextRecords,
    history: localDb.history,
    snapshots: nextSnapshots,
  });

  return {
    preview,
    syncedRecord: nextRecord,
  };
}

function titleValue(properties: Record<string, any>, key: string) {
  return (properties?.[key]?.title || [])
    .map((item: any) => item.plain_text || item.text?.content || '')
    .join('');
}

function richTextValue(properties: Record<string, any>, key: string) {
  return (properties?.[key]?.rich_text || [])
    .map((item: any) => item.plain_text || item.text?.content || '')
    .join('');
}

function selectValue(properties: Record<string, any>, key: string) {
  return properties?.[key]?.select?.name || '';
}

async function notionFetch(path: string, init: RequestInit = {}) {
  const response = await fetch(`${NOTION_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getNotionToken()}`,
      'Notion-Version': NOTION_API_VERSION,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Notion API ${response.status}: ${text}`);
  }

  return response.json();
}

function createHeading(level: 1 | 2 | 3, text: string) {
  const type = `heading_${level}` as const;
  return {
    object: 'block',
    type,
    [type]: {
      rich_text: toRichText(text),
    },
  };
}

function createParagraph(text: string) {
  return chunkText(text).map((content) => ({
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: toRichText(content),
    },
  }));
}

function createBullets(items: string[]) {
  return items.flatMap((item) =>
    chunkText(item).map((content) => ({
      object: 'block',
      type: 'bulleted_list_item',
      bulleted_list_item: {
        rich_text: toRichText(content),
      },
    })),
  );
}

function buildBookBreakdownBlocks(book: BookData) {
  return [
    createHeading(1, book.positioning.title),
    ...createParagraph(`${book.positioning.author} / ${book.positioning.field}`),
    ...createParagraph(book.positioning.oneLiner),
    createHeading(2, '核心命题'),
    ...createParagraph(book.coreProposition.mainTitle),
    ...book.coreProposition.explanation.flatMap((item) => createParagraph(item)),
    createHeading(2, '读书流水线拆书'),
    createHeading(3, '这本书真正回答的问题'),
    ...createParagraph(book.readingPipeline.coreQuestion),
    createHeading(3, '关键模型'),
    ...createBullets(book.readingPipeline.keyModels),
    createHeading(3, '代表性案例'),
    ...createBullets(book.readingPipeline.keyCases),
    createHeading(3, '迁移场景'),
    ...createBullets(book.readingPipeline.transferScenarios),
    createHeading(3, '行动清单'),
    ...createBullets(book.readingPipeline.actionChecklist),
    createHeading(3, 'Alpha 笔记'),
    ...createBullets(book.readingPipeline.alphaNotes),
    createHeading(2, '主题模块'),
    ...book.modules.flatMap((module) => [
      createHeading(3, module.title),
      ...createBullets(module.cards),
    ]),
    createHeading(2, '阅读后可直接带走的结论'),
    ...createBullets(book.conclusions.remember),
    ...createParagraph(book.conclusions.practicalUse),
    createHeading(2, '本次同步'),
    ...createParagraph(`同步时间：${new Date().toLocaleString('zh-CN', {hour12: false})}`),
  ];
}

function buildPageProperties(book: BookData) {
  return {
    书名: {
      title: toRichText(book.positioning.title),
    },
    学科分类: {
      select: {
        name: mapFieldToDiscipline(book.positioning.field, book.positioning.title),
      },
    },
    当前工序: {
      select: {
        name: '💡Alpha笔记',
      },
    },
    核心问题记录: {
      rich_text: toRichText(buildCoreQuestionNotes(book)),
    },
    Alpha笔记: {
      rich_text: toRichText(buildAlphaNotes(book)),
    },
  };
}

function mapNotionPageToRecord(page: any): ReadingPipelineRecord {
  const properties = page.properties || {};
  const title = titleValue(properties, '书名');
  const processValue = (selectValue(properties, '当前工序') || '📥 输入阶段') as NotionProcess;
  const discipline = selectValue(properties, '学科分类') || '其他';

  return {
    id: page.id,
    title,
    dedupeKey: normalizeBookKey(title),
    author: '',
    field: discipline,
    status: notionProcessToStatus(processValue),
    stage: notionProcessToStage(processValue),
    notionProcess: processValue,
    source: 'Notion',
    lastReviewedAt: Date.parse(page.last_edited_time || properties?.['最后打卡']?.created_time || page.created_time || new Date().toISOString()),
    moc: '',
    filename: '',
    tags: [],
    coreQuestionNotes: richTextValue(properties, '核心问题记录'),
    alphaNotes: richTextValue(properties, 'Alpha笔记'),
    pageUrl: page.url,
  };
}

async function fetchAllNotionPages() {
  const pages: any[] = [];
  let cursor: string | null = null;

  do {
    const body: Record<string, unknown> = {page_size: 100};
    if (cursor) {
      body.start_cursor = cursor;
    }

    const response = (await notionFetch(`/databases/${getNotionDatabaseId()}/query`, {
      method: 'POST',
      body: JSON.stringify(body),
    })) as NotionQueryResponse;

    pages.push(...response.results);
    cursor = response.has_more ? response.next_cursor : null;
  } while (cursor);

  return pages;
}

async function appendBookSnapshot(pageId: string, book: BookData) {
  const children = buildBookBreakdownBlocks(book).slice(0, 100);

  await notionFetch(`/blocks/${pageId}/children`, {
    method: 'PATCH',
    body: JSON.stringify({children}),
  });
}

async function upsertBookIntoNotion(book: BookData) {
  const pages = await fetchAllNotionPages();
  const existingRecords = pages.map(mapNotionPageToRecord);
  const candidate = createCandidateFromBook(book);
  const preview = buildPendingPipelineChange(existingRecords, candidate);

  if (preview.action === 'noop' && preview.existing) {
    return {
      preview,
      syncedRecord: preview.existing,
    };
  }

  if (preview.existing) {
    await notionFetch(`/pages/${preview.existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        properties: buildPageProperties(book),
      }),
    });

    await appendBookSnapshot(preview.existing.id, book);

    const refreshedPages = await fetchAllNotionPages();
    const syncedRecord =
      refreshedPages.map(mapNotionPageToRecord).find((item) => item.id === preview.existing?.id) ||
      preview.candidate;

    return {preview, syncedRecord};
  }

  const createdPage = await notionFetch('/pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: {
        database_id: getNotionDatabaseId(),
      },
      properties: buildPageProperties(book),
      children: buildBookBreakdownBlocks(book).slice(0, 100),
    }),
  });

  return {
    preview,
    syncedRecord: mapNotionPageToRecord(createdPage),
  };
}

app.get('/api/books', async (_req, res) => {
  if (useImaStorageMode()) {
    try {
      const db = await readLocalDb();
      res.json({
        configured: hasImaConfig(),
        storageMode: 'ima',
        storageLabel: `IMA 知识库：${getImaKnowledgeBaseName()}（本地索引：${LOCAL_DB_PATH}）`,
        records: sortRecords(db.records),
      });
    } catch (error) {
      res.status(500).json({
        configured: hasImaConfig(),
        storageMode: 'ima',
        message: error instanceof Error ? error.message : '读取 IMA 本地索引失败。',
      });
    }
    return;
  }

  if (useLocalStorageMode()) {
    try {
      const db = await readLocalDb();
      res.json({
        configured: true,
        storageMode: 'local',
        storageLabel: `本地数据库 ${LOCAL_DB_PATH}`,
        records: sortRecords(db.records),
      });
    } catch (error) {
      res.status(500).json({
        configured: true,
        storageMode: 'local',
        message: error instanceof Error ? error.message : '读取本地数据库失败。',
      });
    }
    return;
  }

  if (!hasNotionConfig()) {
    res.status(503).json({
      configured: false,
      storageMode: 'notion',
      message: '未检测到 NOTION_TOKEN。请在 .env.local 中补充 Notion 集成 token 后重试。',
    });
    return;
  }

  try {
    const pages = await fetchAllNotionPages();
    const records = pages
      .map(mapNotionPageToRecord)
      .sort((a, b) => b.lastReviewedAt - a.lastReviewedAt);

    res.json({
      configured: true,
      storageMode: 'notion',
      storageLabel: 'Notion 读书流水线',
      records,
    });
  } catch (error) {
    res.status(500).json({
      configured: true,
      storageMode: 'notion',
      message: error instanceof Error ? error.message : '读取 Notion 数据库失败。',
    });
  }
});

app.get('/api/history', async (_req, res) => {
  try {
    const db = await readLocalDb();
    res.json({
      configured: true,
      history: db.history,
    });
  } catch (error) {
    res.status(500).json({
      configured: true,
      message: error instanceof Error ? error.message : '读取已拆解目录失败。',
    });
  }
});

app.post('/api/history', async (req, res) => {
  const book = req.body?.book as BookData | undefined;
  if (!book?.positioning?.title) {
    res.status(400).json({configured: true, message: '缺少书籍数据。'});
    return;
  }

  try {
    const history = await saveHistoryBook(book);
    res.json({
      configured: true,
      history,
    });
  } catch (error) {
    res.status(500).json({
      configured: true,
      message: error instanceof Error ? error.message : '保存已拆解目录失败。',
    });
  }
});

app.delete('/api/history', async (_req, res) => {
  try {
    await clearHistoryBooks();
    res.json({
      configured: true,
      history: [],
    });
  } catch (error) {
    res.status(500).json({
      configured: true,
      message: error instanceof Error ? error.message : '清空已拆解目录失败。',
    });
  }
});

app.post('/api/preview-book', async (req, res) => {
  const book = req.body?.book as BookData | undefined;
  if (!book?.positioning?.title) {
    res.status(400).json({configured: true, message: '缺少书籍数据。'});
    return;
  }

  if (useImaStorageMode()) {
    if (!hasImaConfig()) {
      res.status(503).json({
        configured: false,
        storageMode: 'ima',
        message: '未检测到 IMA 凭证。请先配置 Client ID、API Key 和知识库 ID。',
      });
      return;
    }

    try {
      const result = await previewImaBook(book);
      res.json({
        configured: true,
        storageMode: 'ima',
        storageLabel: `IMA 知识库：${getImaKnowledgeBaseName()}（本地索引：${LOCAL_DB_PATH}）`,
        preview: result.preview,
      });
    } catch (error) {
      res.status(500).json({
        configured: true,
        storageMode: 'ima',
        message: error instanceof Error ? error.message : '生成 IMA 同步预览失败。',
      });
    }
    return;
  }

  if (useLocalStorageMode()) {
    try {
      const result = await previewLocalBook(book);
      res.json({
        configured: true,
        storageMode: 'local',
        storageLabel: `本地数据库 ${LOCAL_DB_PATH}`,
        ...result,
      });
    } catch (error) {
      res.status(500).json({
        configured: true,
        storageMode: 'local',
        message: error instanceof Error ? error.message : '生成本地数据库预览失败。',
      });
    }
    return;
  }

  if (!hasNotionConfig()) {
    res.status(503).json({
      configured: false,
      storageMode: 'notion',
      message: '未检测到 NOTION_TOKEN。请在 .env.local 中补充 Notion 集成 token 后开启预览与同步。',
    });
    return;
  }

  try {
    const pages = await fetchAllNotionPages();
    const records = pages.map(mapNotionPageToRecord);
    const preview = buildPendingPipelineChange(records, createCandidateFromBook(book));

    res.json({
      configured: true,
      storageMode: 'notion',
      storageLabel: 'Notion 读书流水线',
      preview,
    });
  } catch (error) {
    res.status(500).json({
      configured: true,
      storageMode: 'notion',
      message: error instanceof Error ? error.message : '生成 Notion 同步预览失败。',
    });
  }
});

app.post('/api/sync-book', async (req, res) => {
  const book = req.body?.book as BookData | undefined;
  if (!book?.positioning?.title) {
    res.status(400).json({configured: true, message: '缺少书籍数据。'});
    return;
  }

  if (useImaStorageMode()) {
    if (!hasImaConfig()) {
      res.status(503).json({
        configured: false,
        storageMode: 'ima',
        message: '未检测到 IMA 凭证。请先完成配置。',
      });
      return;
    }

    try {
      const result = await syncImaBook(book);
      res.json({
        configured: true,
        storageMode: 'ima',
        storageLabel: `IMA 知识库：${getImaKnowledgeBaseName()}（本地索引：${LOCAL_DB_PATH}）`,
        ...result,
      });
    } catch (error) {
      res.status(500).json({
        configured: true,
        storageMode: 'ima',
        message: error instanceof Error ? error.message : '写入 IMA 知识库失败。',
      });
    }
    return;
  }

  if (useLocalStorageMode()) {
    try {
      const result = await syncLocalBook(book);
      res.json({
        configured: true,
        storageMode: 'local',
        storageLabel: `本地数据库 ${LOCAL_DB_PATH}`,
        ...result,
      });
    } catch (error) {
      res.status(500).json({
        configured: true,
        storageMode: 'local',
        message: error instanceof Error ? error.message : '写入本地数据库失败。',
      });
    }
    return;
  }

  if (!hasNotionConfig()) {
    res.status(503).json({
      configured: false,
      storageMode: 'notion',
      message: '未检测到 NOTION_TOKEN。请先完成 Notion 配置。',
    });
    return;
  }

  try {
    const result = await upsertBookIntoNotion(book);
    res.json({
      configured: true,
      storageMode: 'notion',
      storageLabel: 'Notion 读书流水线',
      ...result,
    });
  } catch (error) {
    res.status(500).json({
      configured: true,
      storageMode: 'notion',
      message: error instanceof Error ? error.message : '同步到 Notion 失败。',
    });
  }
});

app.listen(PORT, () => {
  const mode = useImaStorageMode() ? 'ima' : useLocalStorageMode() ? 'local' : 'notion';
  console.log(`BookMind storage bridge listening on http://127.0.0.1:${PORT} (mode=${mode})`);
});
