/**
 * Блок статей в sitemap.xml лендинга.
 *
 * Файл принадлежит лендингу: там свои страницы, локали, hreflang и разный стиль
 * разметки. Поэтому целиком он не перегенерируется — правится только участок
 * между маркерами `articles:start` / `articles:end`, всё остальное остаётся как есть.
 */

const START = '<!-- articles:start — генерируется build/build-articles.mjs, руками не править -->';
const END = '<!-- articles:end -->';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** Дата в формате sitemap: YYYY-MM-DD */
const day = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : null);

/** Свежайшая из дат статьи */
const lastmodOf = (a) => day(a.date_updated || a.date_published || a.date_created);

/**
 * Собирает блок <url> для страницы списка и всех статей.
 * @param {object} site       запись лендинга из Directus
 * @param {object[]} articles опубликованные статьи
 * @param {object} opts       compact — однострочные <url>, images — можно ли <image:image>
 * @param {(file:object,width:number)=>string|null} resolveImage путь к скачанной картинке
 */
function urls(site, articles, opts, resolveImage) {
  const baseUrl = (site.base_url || '').replace(/\/$/, '');
  const listUrl = `${baseUrl}${site.article_path || '/articles'}/`;

  const entry = ({ loc, lastmod, changefreq, priority, image }) => {
    const parts = [
      `<loc>${esc(loc)}</loc>`,
      lastmod ? `<lastmod>${lastmod}</lastmod>` : '',
      `<changefreq>${changefreq}</changefreq>`,
      `<priority>${priority}</priority>`,
    ].filter(Boolean);

    if (image) {
      parts.push(opts.compact
        ? `<image:image><image:loc>${esc(image.loc)}</image:loc><image:title>${esc(image.title)}</image:title></image:image>`
        : `<image:image>\n      <image:loc>${esc(image.loc)}</image:loc>\n      <image:title>${esc(image.title)}</image:title>\n    </image:image>`);
    }

    return opts.compact
      ? `  <url>${parts.join('')}</url>`
      : `  <url>\n    ${parts.join('\n    ')}\n  </url>`;
  };

  const dates = articles.map(lastmodOf).filter(Boolean).sort();

  const list = entry({
    loc: listUrl,
    lastmod: dates[dates.length - 1] || null,
    changefreq: 'weekly',
    priority: '0.8',
  });

  const items = articles.map((a) => {
    const hero = opts.images ? resolveImage(a.featured_image, 1200) : null;
    return entry({
      loc: a.canonical_url || `${listUrl}${a.slug}/`,
      lastmod: lastmodOf(a),
      changefreq: 'monthly',
      priority: '0.7',
      image: hero ? { loc: `${baseUrl}/${hero}`, title: a.featured_image_alt || a.title } : null,
    });
  });

  return [list, ...items];
}

/**
 * Возвращает содержимое sitemap.xml с обновлённым блоком статей.
 * Бросает исключение, если файл не похож на sitemap — лучше упасть, чем испортить.
 */
export function updateSitemap(xml, site, articles, resolveImage) {
  if (!xml.includes('</urlset>')) {
    throw new Error('в sitemap.xml нет </urlset> — файл не похож на sitemap, не трогаю');
  }

  // статьи с noindex в карту сайта не идут
  const indexable = articles.filter((a) => !a.noindex);

  const opts = {
    // подстраиваемся под стиль файла: где-то <url> в одну строку, где-то развёрнут
    compact: /<url><loc>/.test(xml),
    // <image:image> валиден только если пространство имён объявлено
    images: /xmlns:image=/.test(xml),
  };

  const block = [START, ...urls(site, indexable, opts, resolveImage), END]
    .map((l, i) => (i === 0 || l === END ? `  ${l}` : l))
    .join('\n');

  // старый блок убираем целиком вместе с маркерами
  const existing = new RegExp(`\\n?[ \\t]*${START.replace(/[.*+?^${}()|[\]\\—]/g, '\\$&')}[\\s\\S]*?${END}`, 'g');
  const cleaned = xml.replace(existing, '');

  return cleaned.replace(/([ \t]*)<\/urlset>/, `${block}\n$1</urlset>`);
}

export const sitemapMarkers = { START, END };
