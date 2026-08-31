/**
 * Шаблоны страниц статей. Ни одной строки контента здесь нет:
 * весь текст, меню, подписи и SEO приходят из Directus.
 */

export const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const fmtDate = (iso, locale) => (iso
  ? new Date(iso).toLocaleDateString(locale || 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  : '');

/** Путь к картинке от корня лендинга. Резолвер задаёт сборка (файлы уже скачаны). */
let resolveImage = () => null;
export const setImageResolver = (fn) => { resolveImage = fn; };
const img = (file, width = 1200) => resolveImage(file, width);

const isExternal = (url) => /^https?:\/\//.test(url || '');
const navHref = (up, url) => (isExternal(url) ? url : `${up}${url}`);

/* ── общие блоки ── */

const headAssets = (up, site) => [
  site.theme_color ? `<meta name="theme-color" content="${esc(site.theme_color)}" />` : '',
  site.favicon_path ? (/\.ico$/.test(site.favicon_path)
    ? `<link rel="icon" href="${up}${esc(site.favicon_path)}" sizes="any" />`
    : /\.svg$/.test(site.favicon_path)
      ? `<link rel="icon" type="image/svg+xml" href="${up}${esc(site.favicon_path)}" />`
      : `<link rel="icon" type="image/png" sizes="32x32" href="${up}${esc(site.favicon_path)}" />`) : '',
  site.apple_icon_path ? `<link rel="apple-touch-icon" sizes="180x180" href="${up}${esc(site.apple_icon_path)}" />` : '',
  site.fonts_url ? `<link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="${esc(site.fonts_url)}" rel="stylesheet" />` : '',
  `<link rel="stylesheet" href="${up}styles.css" />`,
  `<link rel="stylesheet" href="${up}article.css" />`,
].filter(Boolean).join('\n  ');

/** Логотип: картинка, если она задана в админке, иначе эмодзи + текст */
const logoMark = (up, site) => (site.logo_image
  ? `<img class="logo__img" src="${up}${esc(site.logo_image)}" alt="${esc(site.logo_text || site.name)}"${site.logo_image_w ? ` width="${esc(site.logo_image_w)}"` : ''}${site.logo_image_h ? ` height="${esc(site.logo_image_h)}"` : ''} />`
  : [
    site.logo_icon ? `<span class="logo__icon" aria-hidden="true">${esc(site.logo_icon)}</span>` : '',
    site.logo_text ? `<span class="logo__text">${esc(site.logo_text)}</span>` : '',
  ].filter(Boolean).join('\n        '));

const header = (up, current, site) => {
  const items = site.nav_links || [];
  const link = ({ label, url, key }) =>
    `<a href="${esc(navHref(up, url))}"${isExternal(url) ? ' target="_blank" rel="noopener"' : ''}${current && current === key ? ' aria-current="page"' : ''}>${esc(label)}</a>`;
  const cta = (cls) => (site.cta_label && site.cta_url
    ? `<a href="${esc(site.cta_url)}" target="_blank" rel="${esc(site.cta_rel || 'noopener nofollow sponsored')}" class="btn btn--play ${cls}">${esc(site.cta_label)}</a>`
    : '');

  return `  <header class="nav" id="site-header">
    <div class="nav__inner">
      <a class="logo" href="${up}" aria-label="${esc(site.name)}">
        ${logoMark(up, site)}
      </a>
      <nav class="nav__links" aria-label="Primary">
        ${items.map(link).join('\n        ')}
      </nav>
      <div class="nav__actions">
        ${cta('nav__cta')}
        <button class="burger" id="burger" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="mobile-menu">
          <span></span><span></span><span></span>
        </button>
      </div>
    </div>
    <div class="mobile-menu" id="mobile-menu" hidden>
      ${items.map(link).join('\n      ')}
      ${cta('mobile-menu__cta')}
    </div>
  </header>`;
};

const footer = (up, site) => `  <footer class="footer">
    <div class="footer__inner">
      <nav class="footer__quicklinks" aria-label="Footer"><p class="footer__links">${(site.nav_links || [])
        .map(({ label, url }) => `<a href="${esc(navHref(up, url))}">${esc(label)}</a>`).join(' · ')}</p></nav>
      <div class="footer__bottom">
        ${site.footer_copyright ? `<p class="footer__links">${esc(site.footer_copyright)}</p>` : ''}
        ${site.footer_badges ? `<p class="footer__right">${esc(site.footer_badges)}</p>` : ''}
      </div>
    </div>
  </footer>

  <button class="to-top" id="to-top" type="button" aria-label="Scroll back to top">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  </button>
${site.analytics_path ? `\n  <script src="${up}${esc(site.analytics_path)}"></script>` : ''}
  <script src="${up}spoke.js"></script>`;

/** Тело статьи из редактора: таблицы в скролл-обёртку, картинкам — lazy */
const processBody = (html) => (html || '')
  .replace(/<table(?![^>]*class=)/g, '<table class="op-table"')
  .replace(/<table/g, '<div class="table-wrap"><table')
  .replace(/<\/table>/g, '</table></div>')
  .replace(/<img(?![^>]*loading=)/g, '<img loading="lazy" decoding="async"');

/* ── страница статьи ── */

export function renderArticle(site, a, related) {
  const up = '../../';
  const baseUrl = (site.base_url || '').replace(/\/$/, '');
  const listPath = `${site.article_path || '/articles'}/`;
  const canonical = a.canonical_url || `${baseUrl}${listPath}${a.slug}/`;

  const seoTitle = a.seo_title || a.title;
  const description = a.meta_description || a.excerpt || '';
  const ogTitle = a.og_title || seoTitle;
  const ogDesc = a.og_description || description;
  const twTitle = a.twitter_title || ogTitle;
  const twDesc = a.twitter_description || ogDesc;

  const hero = img(a.featured_image, 1200);
  const ogImage = img(a.og_image, 1200) || hero;
  const twImage = img(a.twitter_image, 1200) || ogImage;
  const abs = (p) => (p ? `${baseUrl}/${p}` : null);
  const tagList = (a.tags || []).map((t) => t.tags_id).filter(Boolean);

  const blogPosting = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: a.title,
    description,
    ...(abs(hero) ? { image: [abs(hero)] } : {}),
    datePublished: a.date_published || a.date_created,
    dateModified: a.date_updated || a.date_published || a.date_created,
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
    ...(a.author ? {
      author: {
        '@type': 'Person',
        name: a.author.name,
        ...(a.author.role ? { jobTitle: a.author.role } : {}),
        ...(a.author.socials?.length ? { sameAs: a.author.socials.map((s) => s.url).filter(Boolean) } : {}),
      },
    } : {}),
    publisher: {
      '@type': 'Organization',
      name: site.publisher_name || site.name,
      ...(img(site.publisher_logo, 600) ? { logo: { '@type': 'ImageObject', url: abs(img(site.publisher_logo, 600)) } } : {}),
    },
    ...(a.category ? { articleSection: a.category.name } : {}),
    ...(tagList.length ? { keywords: tagList.map((t) => t.name).join(', ') } : {}),
  };

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: site.label_home || '', item: `${baseUrl}/` },
      { '@type': 'ListItem', position: 2, name: site.label_articles || '', item: `${baseUrl}${listPath}` },
      { '@type': 'ListItem', position: 3, name: a.title, item: canonical },
    ],
  };

  let manualJsonLd = '';
  if (a.jsonld && a.jsonld.trim()) {
    try {
      manualJsonLd = `\n  <script type="application/ld+json">\n${JSON.stringify(JSON.parse(a.jsonld), null, 2)}\n  </script>`;
    } catch { /* невалидный JSON из админки в разметку не попадает */ }
  }

  return `<!DOCTYPE html>
<html lang="${esc(site.locale || 'en')}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <title>${esc(seoTitle)}</title>
  <meta name="description" content="${esc(description)}" />
  ${a.author ? `<meta name="author" content="${esc(a.author.name)}" />` : ''}
  <meta name="robots" content="${a.noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large, max-snippet:-1'}" />
  <link rel="canonical" href="${esc(canonical)}" />
  <link rel="alternate" hreflang="${esc(site.locale || 'en')}" href="${esc(canonical)}" />
  <link rel="alternate" hreflang="x-default" href="${esc(canonical)}" />
  ${headAssets(up, site)}

  <meta property="og:type" content="article" />
  <meta property="og:url" content="${esc(canonical)}" />
  <meta property="og:title" content="${esc(ogTitle)}" />
  <meta property="og:description" content="${esc(ogDesc)}" />
  ${abs(ogImage) ? `<meta property="og:image" content="${esc(abs(ogImage))}" />` : ''}
  ${a.featured_image_alt ? `<meta property="og:image:alt" content="${esc(a.featured_image_alt)}" />` : ''}
  <meta property="og:site_name" content="${esc(site.name)}" />
  <meta property="article:published_time" content="${esc(a.date_published || a.date_created)}" />
  <meta property="article:modified_time" content="${esc(a.date_updated || a.date_published)}" />
  ${a.category ? `<meta property="article:section" content="${esc(a.category.name)}" />` : ''}
  ${tagList.map((t) => `<meta property="article:tag" content="${esc(t.name)}" />`).join('\n  ')}

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(twTitle)}" />
  <meta name="twitter:description" content="${esc(twDesc)}" />
  ${abs(twImage) ? `<meta name="twitter:image" content="${esc(abs(twImage))}" />` : ''}

  <script type="application/ld+json">
${JSON.stringify(blogPosting, null, 2)}
  </script>
  <script type="application/ld+json">
${JSON.stringify(breadcrumb, null, 2)}
  </script>${manualJsonLd}
</head>
<body>
${header(up, 'articles', site)}

  <nav class="breadcrumb" aria-label="Breadcrumb">
    <div class="breadcrumb__inner">
      <a href="${up}">${esc(site.label_home || '')}</a> / <a href="../">${esc(site.label_articles || '')}</a> / <span aria-current="page">${esc(a.title)}</span>
    </div>
  </nav>

  <main class="spoke">
    <article class="art">
      <header class="spoke-hero art-hero">
        <div class="spoke-hero__inner">
          ${a.category ? `<p class="spoke-hero__kicker">${esc(a.category.name)}</p>` : ''}
          <h1>${esc(a.title)}</h1>
          ${a.excerpt ? `<p class="spoke-hero__sub">${esc(a.excerpt)}</p>` : ''}
          <div class="art-meta">
            ${a.author ? `<span class="art-meta__author">${esc(site.label_byline || '')} <strong>${esc(a.author.name)}</strong>${a.author.role ? ` · ${esc(a.author.role)}` : ''}</span>` : ''}
            ${a.date_published ? `<time datetime="${esc(a.date_published)}">${fmtDate(a.date_published, site.date_locale)}</time>` : ''}
            ${a.date_updated && a.date_updated !== a.date_published ? `<span class="art-meta__updated">${esc(site.label_updated || '')} ${fmtDate(a.date_updated, site.date_locale)}</span>` : ''}
          </div>
          ${site.age_notice ? `<p class="age-badge">${esc(site.age_notice)}</p>` : ''}
        </div>
      </header>

      ${hero ? `<figure class="art-figure">
        <img src="${esc(up + hero)}" alt="${esc(a.featured_image_alt || a.title)}" width="1200" fetchpriority="high" decoding="async" />
        ${a.featured_image_caption ? `<figcaption>${esc(a.featured_image_caption)}</figcaption>` : ''}
      </figure>` : ''}

      <div class="spoke-body"><div class="spoke-body__inner art-body">
${processBody(a.body)}
      </div></div>

      ${tagList.length ? `<div class="art-tags"><div class="art-tags__inner">
        ${tagList.map((t) => `<span class="art-tag">#${esc(t.name)}</span>`).join('\n        ')}
      </div></div>` : ''}

      ${a.author ? `<aside class="art-author"><div class="art-author__inner">
        <div class="author-card">
          ${img(a.author.photo, 240) ? `<img class="author-card__avatar" src="${esc(up + img(a.author.photo, 240))}" alt="${esc(a.author.name)}" width="120" height="120" loading="lazy" decoding="async" />` : ''}
          <div class="author-card__text">
            <p class="author-card__name">${esc(a.author.name)}</p>
            ${a.author.role ? `<p class="author-card__role">${esc(a.author.role)}</p>` : ''}
            ${a.author.bio ? `<p class="author-card__bio">${esc(a.author.bio)}</p>` : ''}
            ${(a.author.socials || []).filter((s) => s.url).map((s) => `<a class="author-card__link" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label || '')}</a>`).join('\n            ')}
          </div>
        </div>
      </div></aside>` : ''}

      ${related.length ? `<aside class="related"><div class="related__inner">
        ${site.label_related ? `<h2>${esc(site.label_related)}</h2>` : ''}
        <div class="related__grid">
${related.map((r) => `          <a href="../${esc(r.slug)}/"><span aria-hidden="true">&rarr;</span> ${esc(r.title)}</a>`).join('\n')}
        </div>
      </div></aside>` : ''}
    </article>
  </main>

${footer(up, site)}
</body>
</html>
`;
}

/* ── страница списка ── */

export function renderIndex(site, articles) {
  const up = '../';
  const baseUrl = (site.base_url || '').replace(/\/$/, '');
  const canonical = `${baseUrl}${site.article_path || '/articles'}/`;
  const heading = site.articles_title || site.label_articles || '';
  const title = site.articles_seo_title || heading || site.name;
  const description = site.articles_meta_description || site.articles_intro || '';

  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title,
    description,
    url: canonical,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: articles.map((a, i) => ({
        '@type': 'ListItem', position: i + 1, url: `${canonical}${a.slug}/`, name: a.title,
      })),
    },
  };

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: site.label_home || '', item: `${baseUrl}/` },
      { '@type': 'ListItem', position: 2, name: site.label_articles || heading, item: canonical },
    ],
  };

  const card = (a) => `        <article class="art-card">
          <a class="art-card__link" href="${esc(a.slug)}/">
            ${img(a.featured_image, 640) ? `<img class="art-card__img" src="${esc(up + img(a.featured_image, 640))}" alt="${esc(a.featured_image_alt || a.title)}" width="640" loading="lazy" decoding="async" />` : ''}
            <div class="art-card__text">
              ${a.category ? `<p class="art-card__kicker">${esc(a.category.name)}</p>` : ''}
              <h2 class="art-card__title">${esc(a.title)}</h2>
              ${a.excerpt ? `<p class="art-card__excerpt">${esc(a.excerpt)}</p>` : ''}
              <p class="art-card__meta">
                ${a.date_published ? `<time datetime="${esc(a.date_published)}">${fmtDate(a.date_published, site.date_locale)}</time>` : ''}
                ${a.author ? `<span>${esc(a.author.name)}</span>` : ''}
              </p>
            </div>
          </a>
        </article>`;

  return `<!DOCTYPE html>
<html lang="${esc(site.locale || 'en')}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <link rel="canonical" href="${esc(canonical)}" />
  ${headAssets(up, site)}

  <meta property="og:type" content="website" />
  <meta property="og:url" content="${esc(canonical)}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:site_name" content="${esc(site.name)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(description)}" />

  <script type="application/ld+json">
${JSON.stringify(itemList, null, 2)}
  </script>
  <script type="application/ld+json">
${JSON.stringify(breadcrumb, null, 2)}
  </script>
</head>
<body>
${header(up, 'articles', site)}

  <nav class="breadcrumb" aria-label="Breadcrumb">
    <div class="breadcrumb__inner">
      <a href="${up}">${esc(site.label_home || '')}</a> / <span aria-current="page">${esc(site.label_articles || heading)}</span>
    </div>
  </nav>

  <main class="spoke">
    <section class="spoke-hero">
      <div class="spoke-hero__inner">
        ${site.articles_kicker ? `<p class="spoke-hero__kicker">${esc(site.articles_kicker)}</p>` : ''}
        <h1>${esc(heading)}</h1>
        ${site.articles_intro ? `<p class="spoke-hero__sub">${esc(site.articles_intro)}</p>` : ''}
      </div>
    </section>

    <div class="art-list">
      <div class="art-list__inner">
${articles.length ? `      <div class="art-grid">
${articles.map(card).join('\n')}
      </div>` : `      <p class="placeholder-note">${esc(site.articles_empty_text || '')}</p>`}
      </div>
    </div>
  </main>

${footer(up, site)}
</body>
</html>
`;
}
