const OFFICIAL_RESULTS_URL = "https://www.singaporepools.com.sg/en/product/Pages/4d_results.aspx";
const OFFICIAL_RESULTS_BASE = {
  drawNumber: 3470,
  date: new Date("2013-04-20T00:00:00+08:00")
};

const officialCache = {
  latestDrawNumber: null,
  latestCheckedAt: 0,
  draws: new Map()
};

function encodeDrawQuery(drawNumber) {
  return Buffer.from(`DrawNumber=${drawNumber}`).toString("base64");
}

async function fetchRemoteText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/135.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml"
    }
  });

  if (!response.ok) {
    throw new Error(`Official source returned ${response.status}`);
  }

  return response.text();
}

function extractSingle(pattern, text) {
  const match = text.match(pattern);
  return match ? match[1] : null;
}

function parseOfficialDrawPage(html, expectedDrawNumber) {
  const headerMatch = html.match(
    /<th class='drawDate'>([^<]+)<\/th>\s*<th class='drawNumber'>Draw No\.\s*(\d+)<\/th>/i
  );

  if (!headerMatch) {
    return null;
  }

  const drawNumber = Number(headerMatch[2]);
  if (expectedDrawNumber && drawNumber !== expectedDrawNumber) {
    return null;
  }

  const firstPrize = extractSingle(/<td class='tdFirstPrize'>(\d{4})<\/td>/i, html);
  const secondPrize = extractSingle(/<td class='tdSecondPrize'>(\d{4})<\/td>/i, html);
  const thirdPrize = extractSingle(/<td class='tdThirdPrize'>(\d{4})<\/td>/i, html);
  const starterBlock = extractSingle(/<tbody class='tbodyStarterPrizes'>([\s\S]*?)<\/tbody>/i, html);
  const consolationBlock = extractSingle(/<tbody class='tbodyConsolationPrizes'>([\s\S]*?)<\/tbody>/i, html);

  if (!firstPrize || !secondPrize || !thirdPrize || !starterBlock || !consolationBlock) {
    return null;
  }

  const starterPrizes = [...starterBlock.matchAll(/<td>(\d{4})<\/td>/gi)].map((match) => match[1]);
  const consolationPrizes = [...consolationBlock.matchAll(/<td>(\d{4})<\/td>/gi)].map((match) => match[1]);

  if (starterPrizes.length !== 10 || consolationPrizes.length !== 10) {
    return null;
  }

  return {
    drawNumber,
    drawDate: headerMatch[1].trim(),
    numbers: [firstPrize, secondPrize, thirdPrize, ...starterPrizes, ...consolationPrizes]
  };
}

async function fetchOfficialDraw(drawNumber) {
  if (officialCache.draws.has(drawNumber)) {
    return officialCache.draws.get(drawNumber);
  }

  const url = `${OFFICIAL_RESULTS_URL}?sppl=${encodeDrawQuery(drawNumber)}`;
  try {
    const html = await fetchRemoteText(url);
    const parsed = parseOfficialDrawPage(html, drawNumber);
    officialCache.draws.set(drawNumber, parsed);
    return parsed;
  } catch (error) {
    officialCache.draws.set(drawNumber, null);
    return null;
  }
}

function getHeuristicLatestDrawNumber(now = new Date()) {
  const elapsedMs = now.getTime() - OFFICIAL_RESULTS_BASE.date.getTime();
  const drawsSinceBase = Math.round((elapsedMs / (7 * 24 * 60 * 60 * 1000)) * 2.95);
  return OFFICIAL_RESULTS_BASE.drawNumber + drawsSinceBase;
}

async function discoverLatestDrawNumber() {
  const cacheFresh = Date.now() - officialCache.latestCheckedAt < 6 * 60 * 60 * 1000;
  if (cacheFresh && officialCache.latestDrawNumber) {
    return officialCache.latestDrawNumber;
  }

  const estimate = getHeuristicLatestDrawNumber();
  const seedOffsets = [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    -1, -2, -3, -4, -5, -6, -7, -8, -9, -10, -11, -12, -13, -14, -15, -16,
    -20, -24, -28, -32, -36, -40, -44, -48, -52, -56, -60, -64, -68, -72, -76, -80, -84, -88, -92
  ];

  let seed = null;
  for (const offset of seedOffsets) {
    const candidate = estimate + offset;
    const result = await fetchOfficialDraw(candidate);
    if (result) {
      seed = result.drawNumber;
      break;
    }
  }

  if (!seed) {
    throw new Error("Unable to discover the latest official draw number");
  }

  let latest = seed;
  let misses = 0;
  while (misses < 4) {
    const candidate = latest + 1;
    const result = await fetchOfficialDraw(candidate);
    if (result) {
      latest = result.drawNumber;
      misses = 0;
    } else {
      misses += 1;
    }
  }

  officialCache.latestDrawNumber = latest;
  officialCache.latestCheckedAt = Date.now();
  return latest;
}

async function mapWithConcurrency(values, concurrency, worker) {
  const results = new Array(values.length);
  let index = 0;

  async function runWorker() {
    while (index < values.length) {
      const current = index;
      index += 1;
      results[current] = await worker(values[current], current);
    }
  }

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, values.length)) }, () => runWorker())
  );

  return results;
}

async function fetchOfficialHistory(limit) {
  const latestDrawNumber = await discoverLatestDrawNumber();
  const drawNumbers = Array.from({ length: limit }, (_, offset) => latestDrawNumber - offset);
  const drawResults = await mapWithConcurrency(drawNumbers, 6, (drawNumber) => fetchOfficialDraw(drawNumber));
  const draws = drawResults.filter(Boolean);

  if (draws.length === 0) {
    throw new Error("Official history fetch returned no valid draws");
  }

  return {
    source: "Singapore Pools",
    latestDrawNumber,
    requestedDraws: limit,
    drawCount: draws.length,
    numberCount: draws.reduce((sum, draw) => sum + draw.numbers.length, 0),
    numbers: draws.flatMap((draw) => draw.numbers),
    draws
  };
}

module.exports = {
  fetchOfficialHistory
};
