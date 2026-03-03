import { NextResponse } from 'next/server';

interface IndexData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
}

interface MoverData {
  symbol: string;
  name: string;
  changePercent: number;
}

async function fetchIndex(symbol: string): Promise<IndexData | null> {
  try {
    const encoded = encodeURIComponent(symbol);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=1d`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FinanceNewsBot/1.0)',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const price: number = meta.regularMarketPrice ?? 0;
    const prevClose: number = meta.chartPreviousClose ?? meta.previousClose ?? price;
    const change = price - prevClose;
    const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0;
    return { symbol, price, change, changePercent };
  } catch {
    return null;
  }
}

async function fetchMovers(scrId: string): Promise<MoverData[]> {
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=true&scrIds=${scrId}&count=3&region=US&lang=en-US`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FinanceNewsBot/1.0)',
        Accept: 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const quotes: Record<string, unknown>[] = data?.finance?.result?.[0]?.quotes ?? [];
    return quotes.slice(0, 3).map((q) => ({
      symbol: String(q.symbol ?? ''),
      name: String(q.shortName ?? q.symbol ?? ''),
      changePercent: Number(
        typeof q.regularMarketChangePercent === 'object' && q.regularMarketChangePercent !== null
          ? (q.regularMarketChangePercent as Record<string, unknown>).raw ?? 0
          : q.regularMarketChangePercent ?? 0
      ),
    }));
  } catch {
    return [];
  }
}

export async function GET() {
  const [sp500, nasdaq, dow, gold, silver, copper, dollarIndex, kospi, kosdaq, usdkrw, gainers, losers] =
    await Promise.all([
      fetchIndex('^GSPC'),
      fetchIndex('^IXIC'),
      fetchIndex('^DJI'),
      fetchIndex('GC=F'),
      fetchIndex('SI=F'),
      fetchIndex('HG=F'),
      fetchIndex('DX-Y.NYB'),
      fetchIndex('^KS11'),
      fetchIndex('^KQ11'),
      fetchIndex('KRW=X'),
      fetchMovers('day_gainers'),
      fetchMovers('day_losers'),
    ]);

  return NextResponse.json({
    sp500,
    nasdaq,
    dow,
    gold,
    silver,
    copper,
    dollarIndex,
    kospi,
    kosdaq,
    usdkrw,
    gainers,
    losers,
  });
}
