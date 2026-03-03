export interface RssSource {
  name: string;
  url: string;
  lang: 'en' | 'ko';
  category: string;
}

export const RSS_SOURCES: RssSource[] = [
  {
    name: 'CNBC Markets',
    url: 'https://www.cnbc.com/id/20910258/device/rss/rss.html',
    lang: 'en',
    category: 'us-market',
  },
  {
    name: 'MarketWatch',
    url: 'https://feeds.marketwatch.com/marketwatch/topstories',
    lang: 'en',
    category: 'us-market',
  },
  {
    name: 'AP Business',
    url: 'https://feeds.apnews.com/rss/business',
    lang: 'en',
    category: 'global',
  },
  {
    name: '한국경제',
    url: 'https://www.hankyung.com/feed/all-news',
    lang: 'ko',
    category: 'korea',
  },
  {
    name: '매일경제',
    url: 'https://www.mk.co.kr/rss/30100041/',
    lang: 'ko',
    category: 'korea',
  },
  {
    name: '연합인포맥스',
    url: 'https://news.einfomax.co.kr/rss/allNews.xml',
    lang: 'ko',
    category: 'korea',
  },
  {
    name: '한경글로벌마켓',
    url: 'https://www.hankyung.com/feed/globalmarket',
    lang: 'ko',
    category: 'global-korea',
  },
];

export interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
  source: string;
  lang: 'en' | 'ko';
  category: string;
}
