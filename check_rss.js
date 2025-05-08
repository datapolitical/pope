const Parser = require('rss-parser');
const axios = require('axios');
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
  'pope john paul elected'
];

const GENERIC_PHRASES = [
  'white smoke',
  'papal conclave',
  'sistine chapel',
  'vatican city',
  'cardinals vote',
  'voting underway'
];

const IRRELEVANT_PHRASES = [
  'wildfire',
  'symbolic',
  'engine',
  'fiction',
  'metaphor',
  'celebrity',
  'rumor',
  'speculation'
];

function classifyArticle(title, content) {
  const text = (title + ' ' + content).toLowerCase();

  const isAnnouncement = ANNOUNCEMENT_PHRASES.some(phrase => text.includes(phrase));
  const isWhiteSmoke = text.includes('white smoke');
  const isElectionContext = text.includes('new pope') || text.includes('cardinals elect');

  if (isAnnouncement || (isWhiteSmoke && isElectionContext)) return 'announcement';

  const isGeneric = GENERIC_PHRASES.some(phrase => text.includes(phrase));
  const isIrrelevant = IRRELEVANT_PHRASES.some(phrase => text.includes(phrase));

  if (isGeneric && !isIrrelevant) return 'generic';
  return 'irrelevant';
}

async function sendPushNotification(title, link, isTest = false) {
  const user = process.env.PUSHOVER_USER_KEY;
  const token = process.env.PUSHOVER_APP_TOKEN;

  if (!user || !token) {
    console.error('Pushover credentials not set.');
    return;
  }

  const payload = {
    token,
    user,
    title: isTest ? '*** TEST POPE ALERT ***' : '*** NEW POPE ELECTED ***',
    message: `${title}\n${link}`
  };

  try {
    await axios.post('https://api.pushover.net/1/messages.json', payload);
    console.log('Pushover notification sent.');
  } catch (error) {
    console.error('Error sending Pushover notification:', error.response?.data || error.message);
  }
}

async function main() {
  let article;
  const isTestMode = process.env.TEST_MODE === 'true';

  if (isTestMode) {
    console.log('Running in test mode');
    article = {
      title: 'Habemus Papam: Cardinal John Doe elected Pope Innocent XIV',
      contentSnippet: 'Cardinals have elected a new pope during the fifth ballot.',
      link: 'https://example.com/fake-pope-news'
    };
  } else {
    const feed = await parser.parseURL('https://www.catholicnewsagency.com/rss');
    article = feed.items[0];
  }

  const title = article.title || '';
  const content = article.contentSnippet || article.content || '';
  const classification = classifyArticle(title, content);

  if (classification === 'announcement') {
    console.log(`*** NEW POPE ELECTED ***\n${title}\n${article.link}`);
    await sendPushNotification(title, article.link, isTestMode);
  } else {
    console.log(`[${classification.toUpperCase()}] ${title}`);
  }
}

main();