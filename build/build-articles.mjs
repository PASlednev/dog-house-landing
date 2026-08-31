#!/usr/bin/env node
/**
 * Собирает страницы статей из Directus в статические файлы:
 *   articles/index.html          список
 *   articles/<slug>/index.html   статья
 *
 * И обновляет блок статей в sitemap.xml лендинга (остальное в нём не трогает).
 *
 *   node build/build-articles.mjs
 *
 * Конфиг — окружение или build/.env:
 *   DIRECTUS_URL    адрес Directus            (по умолчанию http://localhost:8057)
 *   DIRECTUS_TOKEN  статик-токен роли Build   (обязателен)
 *   SITE_KEY        ключ лендинга в Directus  (по умолчанию cr)
 *
 * Контента в скрипте нет: весь текст, меню и SEO приходят из админки.
 * Шаблоны — build/render.js.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderArticle, renderIndex, setImageResolver } from './render.js';
import { updateSitemap } from './sitemap.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const envFile = join(ROOT, 'build', '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const k = t.slice(0, t.indexOf('=')).trim();
    if (!process.env[k]) process.env[k] = t.slice(t.indexOf('=') + 1).trim();
  }
}

const DIRECTUS = (process.env.DIRECTUS_URL || 'http://localhost:8057').replace(/\/$/, '');
const TOKEN = process.env.DIRECTUS_TOKEN;
const SITE_KEY = process.env.SITE_KEY || 'cr';

if (!TOKEN) {
  console.error('Нет DIRECTUS_TOKEN. Положи его в build/.env (см. build/.env.example).');
  process.exit(1);
}

async function dget(path) {
  const res = await fetch(`${DIRECTUS}${path}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).data;
}

/* ── картинки: ресайз и WebP делает Directus, сюда падает готовый файл ── */
const IMG_DIR = join(ROOT, 'assets', 'articles');
const imgCache = new Map();          // `${id}:${width}` → 'assets/articles/name.webp'
const used = new Set();

async function fetchImage(file, width) {
  if (!file) return null;
  const key = `${file.id}:${width}`;
  if (imgCache.has(key)) return imgCache.get(key);

  const base = (file.filename_download || file.id)
    .replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').toLowerCase();
  const name = `${base}-${width}.webp`;
  const relPath = `assets/articles/${name}`;
  const dest = join(IMG_DIR, name);

  if (!existsSync(dest)) {
    mkdirSync(IMG_DIR, { recursive: true });
    const url = `${DIRECTUS}/assets/${file.id}?width=${width}&quality=78&format=webp&fit=inside&withoutEnlargement=true`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (!res.ok) {
      console.warn(`    ! картинка ${file.filename_download} → ${res.status}, пропущена`);
      imgCache.set(key, null);
      return null;
    }
    writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    console.log(`    ↓ ${relPath}`);
  }
  imgCache.set(key, relPath);
  used.add(name);
  return relPath;
}

setImageResolver((file, width) => (file ? imgCache.get(`${file.id}:${width}`) ?? null : null));

/* ── поля ── */
const ARTICLE_FIELDS = [
  'id', 'status', 'title', 'slug', 'body', 'excerpt', 'noindex',
  'seo_title', 'meta_description', 'canonical_url',
  'og_title', 'og_description', 'twitter_title', 'twitter_description',
  'jsonld', 'date_published', 'date_created', 'date_updated',
  'featured_image_alt', 'featured_image_caption',
  'featured_image.id', 'featured_image.filename_download',
  'og_image.id', 'og_image.filename_download',
  'twitter_image.id', 'twitter_image.filename_download',
  'category.name', 'category.slug',
  'author.name', 'author.role', 'author.bio', 'author.socials',
  'author.photo.id', 'author.photo.filename_download',
  'tags.tags_id.name', 'tags.tags_id.slug',
  'related_articles.related_id.slug', 'related_articles.related_id.title', 'related_articles.related_id.status',
].join(',');

/* ── сборка ── */
console.log(`Directus: ${DIRECTUS}\nЛендинг:  ${SITE_KEY}\n`);

const [site] = await dget(
  `/items/sites?filter[key][_eq]=${encodeURIComponent(SITE_KEY)}` +
  '&fields=*,publisher_logo.id,publisher_logo.filename_download&limit=1');
if (!site) throw new Error(`Лендинг с key=${SITE_KEY} не найден в Directus`);

const articles = await dget(
  `/items/articles?filter[site][key][_eq]=${encodeURIComponent(SITE_KEY)}&filter[status][_eq]=published` +
  `&fields=${ARTICLE_FIELDS}&sort=-date_published&limit=-1`);
console.log(`Опубликованных статей: ${articles.length}\n`);

// сначала все картинки — рендер синхронный
await fetchImage(site.publisher_logo, 600);
for (const a of articles) {
  await fetchImage(a.featured_image, 1200);
  await fetchImage(a.featured_image, 640);
  await fetchImage(a.og_image, 1200);
  await fetchImage(a.twitter_image, 1200);
  await fetchImage(a.author?.photo, 240);
}

const outDir = join(ROOT, (site.article_path || '/articles').replace(/^\//, ''));
mkdirSync(outDir, { recursive: true });

for (const a of articles) {
  let related = (a.related_articles || []).map((r) => r.related_id).filter((r) => r && r.status === 'published');
  if (related.length < 3 && a.category) {
    const pool = articles.filter((x) => x.id !== a.id
      && x.category?.slug === a.category.slug
      && !related.some((r) => r.slug === x.slug));
    related = related.concat(pool.slice(0, 3 - related.length));
  }

  const dir = join(outDir, a.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), renderArticle(site, a, related));
  console.log(`  • ${(site.article_path || '/articles')}/${a.slug}/`);
}

writeFileSync(join(outDir, 'index.html'), renderIndex(site, articles));
console.log(`  • ${(site.article_path || '/articles')}/`);

/* ── подчистка: всё, что больше не нужно, из репозитория убираем ── */

/* страницы снятых с публикации и удалённых статей */
const slugs = new Set(articles.map((a) => a.slug));
for (const entry of readdirSync(outDir)) {
  const p = join(outDir, entry);
  if (statSync(p).isDirectory() && !slugs.has(entry)) {
    rmSync(p, { recursive: true });
    console.log(`  × убрана устаревшая страница ${entry}/`);
  }
}

/* картинки, на которые больше никто не ссылается.
   Папка assets/articles целиком принадлежит сборке — исходники лендинга
   лежат уровнем выше и сюда не попадают. */
if (existsSync(IMG_DIR)) {
  for (const entry of readdirSync(IMG_DIR)) {
    if (used.has(entry)) continue;
    const p = join(IMG_DIR, entry);
    if (!statSync(p).isFile()) continue;
    rmSync(p);
    console.log(`  × убрана осиротевшая картинка assets/articles/${entry}`);
  }
}

/* ── sitemap: правим только свой блок, чужие страницы не трогаем ── */
const sitemapFile = join(ROOT, 'sitemap.xml');
if (!existsSync(sitemapFile)) {
  console.warn('\n  ! sitemap.xml не найден — блок статей не добавлен');
} else {
  const before = readFileSync(sitemapFile, 'utf8');
  const after = updateSitemap(before, site, articles, (file, width) => imgCache.get(`${file?.id}:${width}`) ?? null);
  if (after !== before) {
    writeFileSync(sitemapFile, after);
    console.log(`  • sitemap.xml: статей в карте — ${articles.filter((a) => !a.noindex).length} + страница списка`);
  } else {
    console.log('  · sitemap.xml без изменений');
  }
}

console.log(`\nГотово: ${articles.length + 1} стр.`);
