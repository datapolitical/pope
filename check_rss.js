const Parser = require('rss-parser');
const parser = new Parser();

const ANNOUNCEMENT_PHRASES = [
  'habemus papam',
  'new pope elected',
  'cardinal elected pope',
  'pope francis elected',
  'we have a pope',
  'vatican announces new pope',
  'pope francis successor',
  'pope has been elected',
  'new pontiff',
  'bishop of rome elected',
  'cardinals elect new pope',
  'pope [name] elected', // fuzzy placeholder
];

const GENERIC_PHRASES = [
  'white smoke',
  'papal conclave',
  'sistine chapel',
  'vatican city',
  'cardinals vote',
  'voting underway',
];

const IRRELEVANT_PHRASES = [
  'wildfire',
  'symbolic',
  'engine',
  'fiction',
  'metaphor',
  'celebrity',
  'rumor',
  'speculation',
];

function classifyArticle(title, content) {
  const text = (title + ' ' + content).toLowerCase();

  const isAnnouncement = ANNOUNCEMENT_PHRASES.some(phrase => text.includes(phrase));
  const isWhiteSmoke = text.includes('white smoke');
  const isElectionContext = text.includes('new pope') || text.includes('cardinals elect');

  if (isAnnouncement || (isWhiteSmoke && isElectionContext)) {
    return 'announcement';
  }

  const isGeneric = GENERIC_PHRASES.some(phrase => text.includes(phrase));
  const isIrrelevant = IRRELEVANT_PHRASES.some(phrase => text.includes(phrase));

  if (isGeneric && !isIrrelevant) return 'generic';
  return 'irrelevant';
}

(async () => {
  const feed = await parser.parseURL('https://www.catholicnewsagency.com/rss');
  const article = feed.items[0];
  const title = article.title || '';
  const content = article.contentSnippet || article.content || '';

  const classification = classifyArticle(title, content);

  if (classification === 'announcement') {
    console.log(`*** NEW POPE ELECTED ***\n${title}\n${article.link}`);
    // insert your notification logic here (e.g. webhook, Pushover, etc.)
  } else {
    console.log(`[${classification.toUpperCase()}] ${title}`);
  }
})();