// Upstream search may substitute popular dramas when no keyword matches exist.
// Match only searchable metadata, never IDs, cover URLs or unrelated payload fields.
function textOf(value) {
  if (Array.isArray(value)) return value.map(textOf).join(' ');
  if (value && typeof value === 'object') {
    return ['name', 'nickname', 'tag_name', 'title', 'text', 'sub_title']
      .map(key => textOf(value[key])).join(' ');
  }
  return typeof value === 'string' ? value.replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"').replace(/&#0?39;/g, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .normalize('NFKC').toLowerCase() : '';
}

function matchesSearchKeyword(keyword, ...fields) {
  const terms = textOf(keyword).trim().split(/\s+/).filter(Boolean);
  const metadata = fields.map(textOf).join(' ');
  return terms.every(term => metadata.includes(term));
}

module.exports = { matchesSearchKeyword };
