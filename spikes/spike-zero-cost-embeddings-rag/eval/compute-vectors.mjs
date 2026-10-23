// Calcula os vetores do material fictício e das 30 perguntas com cada modelo candidato e grava em
// ../src/Content/vectors/<slug>.json. Roda uma vez, na máquina de quem conduz o spike (não no CI): os modelos somam
// ~650 MB de download. O `yarn verify` do spike recalcula o recall@3 a partir desses arquivos.
//
//   cd eval && yarn install --frozen-lockfile && yarn vectors
//
// Tudo de graça e sem chave: os modelos vêm do Hugging Face (licenças MIT e Apache 2.0) e rodam aqui, em ONNX.
import { mkdirSync, readFileSync, writeFileSync, existsSync, openSync, readSync, statSync } from 'node:fs';
import path from 'node:path';
import { env, pipeline } from '@huggingface/transformers';
import { Tokenizer } from '@huggingface/tokenizers';

const HERE = import.meta.dirname;
const CONTENT = path.join(HERE, '..', 'src', 'Content');
const OUT = path.join(CONTENT, 'vectors');
env.cacheDir = path.join(HERE, '.cache-hf');

const kb = JSON.parse(readFileSync(path.join(CONTENT, 'knowledge_base.json'), 'utf8'));
const questions = JSON.parse(readFileSync(path.join(CONTENT, 'eval_questions.json'), 'utf8')).questions;
const passageText = (p) => `${p.title}. ${p.text}`;
const round = (v) => v.map((x) => Math.round(x * 1e5) / 1e5);
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const mb = (bytes) => Math.round(bytes / 1e5) / 10;

/** Tamanho real do arquivo no Hugging Face (o que o navegador baixaria). */
async function remoteSize(repo, file) {
  const r = await fetch(`https://huggingface.co/api/models/${repo}/tree/main/${path.dirname(file)}`);
  const f = (await r.json()).find((x) => x.path === file);
  if (!f) throw new Error(`${repo}: ${file} não encontrado`);
  return f.size;
}

function save(slug, data) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, `${slug}.json`), `${JSON.stringify(data)}\n`);
  console.log(`${slug}: ${data.dims} dimensões, download ${data.downloadMB} MB, ${data.perQueryMs} ms por pergunta`);
}

// --- Modelos transformer (transformers.js, os mesmos pesos ONNX que o navegador usaria) ---
const TRANSFORMERS = [
  { slug: 'e5-small', repo: 'Xenova/multilingual-e5-small', license: 'MIT', query: 'query: ', passage: 'passage: ' },
  { slug: 'minilm-l12', repo: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2', license: 'Apache-2.0', query: '', passage: '' },
];
for (const m of TRANSFORMERS) {
  const t0 = performance.now();
  const extractor = await pipeline('feature-extraction', m.repo, { dtype: 'q8' });
  const loadMs = Math.round(performance.now() - t0);
  const embed = async (text) => Array.from((await extractor(text, { pooling: 'mean', normalize: true })).data);
  const passages = {};
  for (const p of kb.passages) passages[p.id] = round(await embed(m.passage + passageText(p)));
  const times = [];
  const qv = {};
  for (const q of questions) {
    const t = performance.now();
    qv[q.id] = round(await embed(m.query + q.question));
    times.push(performance.now() - t);
  }
  save(m.slug, {
    model: m.repo,
    license: m.license,
    file: 'onnx/model_quantized.onnx (int8)',
    dims: passages[kb.passages[0].id].length,
    downloadMB: mb((await remoteSize(m.repo, 'onnx/model_quantized.onnx')) + (await remoteSize(m.repo, 'tokenizer.json').catch(() => 0))),
    loadMs,
    perQueryMs: Math.round(median(times) * 10) / 10,
    passages,
    questions: qv,
  });
}

// --- Modelo estático (sem rede neural: média dos vetores das palavras). Lido direto do safetensors. ---
const STATIC = 'sentence-transformers/static-similarity-mrl-multilingual-v1';
const SDIR = path.join(HERE, '.cache-static');
mkdirSync(SDIR, { recursive: true });
for (const f of ['tokenizer.json', 'model.safetensors']) {
  const dest = path.join(SDIR, f);
  if (!existsSync(dest)) {
    console.log(`baixando ${STATIC}/0_StaticEmbedding/${f}...`);
    const r = await fetch(`https://huggingface.co/${STATIC}/resolve/main/0_StaticEmbedding/${f}`);
    writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
  }
}
const tokenizer = new Tokenizer(JSON.parse(readFileSync(path.join(SDIR, 'tokenizer.json'), 'utf8')), {});
const fd = openSync(path.join(SDIR, 'model.safetensors'), 'r');
const header = Buffer.alloc(8);
readSync(fd, header, 0, 8, 0);
const headerLen = Number(header.readBigUInt64LE());
const headerJson = Buffer.alloc(headerLen);
readSync(fd, headerJson, 0, headerLen, 8);
const meta = JSON.parse(headerJson.toString('utf8'));
const [vocab, fullDims] = meta['embedding.weight'].shape;
const rowOf = (id) => {
  const b = Buffer.alloc(fullDims * 4);
  readSync(fd, b, 0, b.length, 8 + headerLen + id * fullDims * 4);
  return new Float32Array(b.buffer, b.byteOffset, fullDims);
};
/**
 * Vetor da frase = média dos vetores dos tokens, normalizada. Com `int8Dims`, simula o arquivo que iria para o
 * navegador: só as primeiras dimensões (Matryoshka) e cada linha quantizada em int8 com a própria escala.
 */
const embedStatic = (text, int8Dims) => {
  const dims = int8Dims ?? fullDims;
  const sum = new Float64Array(dims);
  for (const id of tokenizer.encode(text, { add_special_tokens: false }).ids) {
    let row = rowOf(id).subarray(0, dims);
    if (int8Dims) {
      const scale = Math.max(...row.map(Math.abs)) / 127 || 1;
      row = row.map((x) => Math.round(x / scale) * scale);
    }
    for (let i = 0; i < dims; i++) sum[i] += row[i];
  }
  const n = Math.hypot(...sum) || 1;
  return Array.from(sum, (x) => x / n);
};
const tokenizerBytes = statSync(path.join(SDIR, 'tokenizer.json')).size;
for (const [slug, int8Dims, file, bytes] of [
  ['static-1024', undefined, '0_StaticEmbedding/model.safetensors (float32)', statSync(path.join(SDIR, 'model.safetensors')).size],
  ['static-256-int8', 256, 'gerado: primeiras 256 dimensões, int8 por linha', vocab * 256 + vocab * 4],
]) {
  const passages = {};
  for (const p of kb.passages) passages[p.id] = round(embedStatic(passageText(p), int8Dims));
  const times = [];
  const qv = {};
  for (const q of questions) {
    const t = performance.now();
    qv[q.id] = round(embedStatic(q.question, int8Dims));
    times.push(performance.now() - t);
  }
  save(slug, {
    model: STATIC,
    license: 'Apache-2.0',
    file,
    dims: int8Dims ?? fullDims,
    downloadMB: mb(bytes + tokenizerBytes),
    loadMs: null,
    perQueryMs: Math.round(median(times) * 10) / 10,
    passages,
    questions: qv,
  });
}
