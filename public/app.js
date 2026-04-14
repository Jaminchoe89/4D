const demoData = [
  "8123", "4271", "6604", "1948", "5502", "0038", "7215", "2480", "9841", "1736",
  "3328", "4701", "9145", "2206", "7812", "4481", "3057", "8630", "1904", "6147",
  "0024", "4258", "9780", "1714", "6402", "5348", "2801", "7160", "0041", "5978",
  "8306", "1128", "4609", "2751", "9042", "3417", "6880", "1256", "7411", "0908",
  "5342", "2784", "8416", "0082", "1950", "4327", "7108", "2604", "9917", "1440",
  "6732", "3146", "8824", "5071", "1498", "6250", "2701", "4486", "1634", "8021"
].join("\n");

const presetConfig = {
  balanced: { position: 32, overall: 18, recency: 24, pair: 16, shape: 10 },
  recency: { position: 24, overall: 10, recency: 42, pair: 16, shape: 8 },
  position: { position: 44, overall: 14, recency: 20, pair: 14, shape: 8 },
  contrarian: { position: 18, overall: 14, recency: 8, pair: 18, shape: 6 }
};

const OFFICIAL_HISTORY_BATCH_SIZE = 250;
const OFFICIAL_HISTORY_CACHE_KEY = "sg4d-official-history-v3";
const OFFICIAL_HISTORY_CACHE_VERSION = "2026-04-15";

const els = {
  historyInput: document.querySelector("#history-input"),
  loadDemo: document.querySelector("#load-demo"),
  importTrigger: document.querySelector("#import-trigger"),
  historyFileInput: document.querySelector("#history-file-input"),
  importDropzone: document.querySelector("#import-dropzone"),
  importMode: document.querySelector("#import-mode"),
  importedFileName: document.querySelector("#imported-file-name"),
  importedFileStatus: document.querySelector("#imported-file-status"),
  officialAsOf: document.querySelector("#official-as-of"),
  officialFetchStatus: document.querySelector("#official-fetch-status"),
  officialImportButton: document.querySelector("#official-import-button"),
  historyAsOfCopy: document.querySelector("#history-as-of-copy"),
  historyAsOfPill: document.querySelector("#history-as-of-pill"),
  analyzeButton: document.querySelector("#analyze-button"),
  presetSelect: document.querySelector("#preset-select"),
  candidateCount: document.querySelector("#candidate-count"),
  recentWindow: document.querySelector("#recent-window"),
  diversityThreshold: document.querySelector("#diversity-threshold"),
  entryCount: document.querySelector("#entry-count"),
  parseStatus: document.querySelector("#parse-status"),
  metricTopScore: document.querySelector("#metric-top-score"),
  metricTopNumber: document.querySelector("#metric-top-number"),
  metricHotDigit: document.querySelector("#metric-hot-digit"),
  metricHotDigitCopy: document.querySelector("#metric-hot-digit-copy"),
  metricShape: document.querySelector("#metric-shape"),
  metricShapeCopy: document.querySelector("#metric-shape-copy"),
  candidateList: document.querySelector("#candidate-list"),
  heatmap: document.querySelector("#heatmap"),
  insights: document.querySelector("#insights")
};

const sliders = {
  position: {
    input: document.querySelector("#weight-position"),
    output: document.querySelector("#weight-position-value")
  },
  overall: {
    input: document.querySelector("#weight-overall"),
    output: document.querySelector("#weight-overall-value")
  },
  recency: {
    input: document.querySelector("#weight-recency"),
    output: document.querySelector("#weight-recency-value")
  },
  pair: {
    input: document.querySelector("#weight-pair"),
    output: document.querySelector("#weight-pair-value")
  },
  shape: {
    input: document.querySelector("#weight-shape"),
    output: document.querySelector("#weight-shape-value")
  }
};

function updateSliderLabels() {
  Object.values(sliders).forEach(({ input, output }) => {
    output.textContent = input.value;
  });
}

function applyPreset(name) {
  const preset = presetConfig[name];
  if (!preset) {
    return;
  }

  Object.entries(preset).forEach(([key, value]) => {
    sliders[key].input.value = value;
  });
  updateSliderLabels();
}

function getSingaporeDateParts() {
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(new Date());
}

function getSingaporeDateStamp() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function getAsOfCopy() {
  return `Official Singapore Pools history as of ${getSingaporeDateParts()} (Singapore).`;
}

function updateAsOfUi(copy) {
  els.officialAsOf.value = copy;
  els.historyAsOfCopy.textContent = copy;
  els.historyAsOfPill.textContent = `As of ${getSingaporeDateParts()}`;
}

function extractNumbers(rawText) {
  const matches = rawText.match(/(?<!\d)\d{4}(?!\d)/g) || [];
  return matches.map((entry) => entry.padStart(4, "0"));
}

function classifyShape(number) {
  const counts = {};
  for (const digit of number) {
    counts[digit] = (counts[digit] || 0) + 1;
  }
  return Object.values(counts).sort((a, b) => b - a).join("-");
}

function normalize(value, maxValue) {
  if (!maxValue) {
    return 0;
  }
  return value / maxValue;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function buildStats(entries, recentWindow) {
  const overall = Array(10).fill(0);
  const position = Array.from({ length: 4 }, () => Array(10).fill(0));
  const recentPosition = Array.from({ length: 4 }, () => Array(10).fill(0));
  const pair = Array.from({ length: 3 }, () => Array(100).fill(0));
  const shapeCounts = {};
  const numberCounts = new Map();
  const recentNumbers = new Map();

  let hottestDigit = 0;
  let hottestDigitCount = 0;

  entries.forEach((entry, index) => {
    const recentDistance = entries.length - 1 - index;
    const recencyWeight = Math.max(0.12, 1 - recentDistance / Math.max(recentWindow, 1));
    const shape = classifyShape(entry);
    shapeCounts[shape] = (shapeCounts[shape] || 0) + 1;
    numberCounts.set(entry, (numberCounts.get(entry) || 0) + 1);

    if (recentDistance < recentWindow) {
      recentNumbers.set(entry, recentDistance);
    }

    for (let i = 0; i < 4; i += 1) {
      const digit = Number(entry[i]);
      overall[digit] += 1;
      position[i][digit] += 1;
      recentPosition[i][digit] += recencyWeight;
      if (overall[digit] > hottestDigitCount) {
        hottestDigit = digit;
        hottestDigitCount = overall[digit];
      }
      if (i < 3) {
        const nextDigit = Number(entry[i + 1]);
        pair[i][digit * 10 + nextDigit] += 1;
      }
    }
  });

  const maxPosition = position.map((row) => Math.max(...row));
  const maxRecentPosition = recentPosition.map((row) => Math.max(...row));
  const maxPair = pair.map((row) => Math.max(...row));
  const maxOverall = Math.max(...overall);
  const maxShape = Math.max(0, ...Object.values(shapeCounts));
  const topShape = Object.entries(shapeCounts).sort((a, b) => b[1] - a[1])[0] || ["-", 0];

  return {
    overall,
    position,
    recentPosition,
    pair,
    shapeCounts,
    numberCounts,
    recentNumbers,
    maxPosition,
    maxRecentPosition,
    maxPair,
    maxOverall,
    maxShape,
    hottestDigit,
    hottestDigitCount,
    topShape
  };
}

function getWeights() {
  return Object.fromEntries(
    Object.entries(sliders).map(([key, { input }]) => [key, Number(input.value)])
  );
}

function scoreCandidate(number, stats, weights, recentWindow, historySize) {
  const shape = classifyShape(number);
  const digits = number.split("").map(Number);

  let positionScore = 0;
  let overallScore = 0;
  let recentScore = 0;
  let pairScore = 0;

  for (let i = 0; i < 4; i += 1) {
    positionScore += normalize(stats.position[i][digits[i]], stats.maxPosition[i]);
    overallScore += normalize(stats.overall[digits[i]], stats.maxOverall);
    recentScore += normalize(stats.recentPosition[i][digits[i]], stats.maxRecentPosition[i]);

    if (i < 3) {
      const pairKey = digits[i] * 10 + digits[i + 1];
      pairScore += normalize(stats.pair[i][pairKey], stats.maxPair[i]);
    }
  }

  positionScore /= 4;
  overallScore /= 4;
  recentScore /= 4;
  pairScore /= 3;

  const shapeScore = normalize(stats.shapeCounts[shape] || 0, stats.maxShape);
  const seenCount = stats.numberCounts.get(number) || 0;
  const recentDistance = stats.recentNumbers.get(number);
  const recentPenalty =
    recentDistance === undefined ? 0 : clamp((recentWindow - recentDistance) / recentWindow, 0, 1) * 0.28;
  const repeatPenalty = seenCount > 0 ? Math.min(0.14, seenCount / Math.max(historySize, 1)) : 0;

  const rawScore =
    positionScore * weights.position +
    overallScore * weights.overall +
    recentScore * weights.recency +
    pairScore * weights.pair +
    shapeScore * weights.shape -
    recentPenalty * 100 -
    repeatPenalty * 100;

  return {
    number,
    score: rawScore,
    components: {
      positionScore,
      overallScore,
      recentScore,
      pairScore,
      shapeScore,
      seenCount
    }
  };
}

function sharedDigitCount(left, right) {
  const leftCounts = {};
  for (const digit of left) {
    leftCounts[digit] = (leftCounts[digit] || 0) + 1;
  }

  let shared = 0;
  for (const digit of right) {
    if (leftCounts[digit]) {
      shared += 1;
      leftCounts[digit] -= 1;
    }
  }
  return shared;
}

function diversify(ranked, count, threshold) {
  const picks = [];
  for (const candidate of ranked) {
    const tooSimilar = picks.some((picked) => sharedDigitCount(candidate.number, picked.number) > threshold);
    if (!tooSimilar) {
      picks.push(candidate);
    }
    if (picks.length >= count) {
      break;
    }
  }
  return picks.length > 0 ? picks : ranked.slice(0, count);
}

function formatShape(shapeKey) {
  const mapping = {
    "1-1-1-1": "All digits different",
    "2-1-1": "One pair",
    "2-2": "Two pairs",
    "3-1": "Three of a kind",
    "4": "All digits same"
  };
  return mapping[shapeKey] || shapeKey;
}

function refreshHistoryMeta() {
  const entries = extractNumbers(els.historyInput.value);
  els.entryCount.textContent = `${entries.length} parsed entr${entries.length === 1 ? "y" : "ies"}`;
  els.parseStatus.textContent = entries.length < 12 ? "Waiting for enough history" : "Ready to analyze";
  return entries;
}

function setImportStatus(fileName, status) {
  els.importedFileName.value = fileName;
  els.importedFileStatus.value = status;
}

function applyImportedEntries(importedEntries, modeOverride) {
  const mode = modeOverride || els.importMode.value;
  const currentEntries = extractNumbers(els.historyInput.value);
  const nextEntries = mode === "append" ? currentEntries.concat(importedEntries) : importedEntries;
  els.historyInput.value = nextEntries.join("\n");
  refreshHistoryMeta();
}

function writeOfficialHistoryCache(payload) {
  try {
    localStorage.setItem(
      OFFICIAL_HISTORY_CACHE_KEY,
      JSON.stringify({
        version: OFFICIAL_HISTORY_CACHE_VERSION,
        dateStamp: getSingaporeDateStamp(),
        payload
      })
    );
  } catch (error) {
    // Ignore cache write failures such as private mode quota limits.
  }
}

function readOfficialHistoryCache() {
  try {
    const raw = localStorage.getItem(OFFICIAL_HISTORY_CACHE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (
      parsed.version !== OFFICIAL_HISTORY_CACHE_VERSION ||
      parsed.dateStamp !== getSingaporeDateStamp() ||
      !parsed.payload ||
      !Array.isArray(parsed.payload.numbers)
    ) {
      return null;
    }

    return parsed.payload;
  } catch (error) {
    return null;
  }
}

async function importHistoryFile(file) {
  const extension = (file.name.split(".").pop() || "").toLowerCase();
  const supported = ["txt", "csv", "json", "html", "htm"];

  if (!supported.includes(extension)) {
    setImportStatus(file.name, "Unsupported file type");
    return;
  }

  setImportStatus(file.name, "Reading file");

  try {
    const text = await file.text();
    const importedEntries = extractNumbers(text);

    if (importedEntries.length === 0) {
      setImportStatus(file.name, "No 4-digit values found");
      return;
    }

    applyImportedEntries(importedEntries);
    setImportStatus(file.name, `${importedEntries.length} values imported`);
  } catch (error) {
    setImportStatus(file.name, "Import failed");
  } finally {
    els.historyFileInput.value = "";
  }
}

async function importOfficialHistory() {
  els.officialImportButton.disabled = true;
  els.officialFetchStatus.value = "Fetching full official history";

  try {
    let startDraw = null;
    let latestDrawNumber = null;
    const allDraws = [];
    const seenDrawNumbers = new Set();

    while (startDraw !== 0) {
      const query = new URLSearchParams({ draws: String(OFFICIAL_HISTORY_BATCH_SIZE) });
      if (startDraw !== null) {
        query.set("startDraw", String(startDraw));
      }

      const response = await fetch(`/api/official-history?${query.toString()}`);
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Official fetch failed");
      }

      latestDrawNumber = payload.latestDrawNumber;
      payload.draws.forEach((draw) => {
        if (!seenDrawNumbers.has(draw.drawNumber)) {
          seenDrawNumbers.add(draw.drawNumber);
          allDraws.push(draw);
        }
      });

      els.officialFetchStatus.value = `Loading official history: ${allDraws.length} draws synced`;
      startDraw = payload.nextStartDraw;

      if (!startDraw || startDraw < 1) {
        break;
      }
    }

    allDraws.sort((left, right) => left.drawNumber - right.drawNumber);
    const allNumbers = allDraws.flatMap((draw) => draw.numbers);
    const latestDrawDate = allDraws.length > 0 ? allDraws[allDraws.length - 1].drawDate : "latest available draw";

    applyImportedEntries(allNumbers, "replace");
    setImportStatus(
      "Singapore Pools official history",
      `${allNumbers.length} values from ${allDraws.length} draws`
    );
    updateAsOfUi(getAsOfCopy());
    els.officialFetchStatus.value = `Preloaded through draw ${latestDrawNumber} (${latestDrawDate})`;
    writeOfficialHistoryCache({
      latestDrawNumber,
      latestDrawDate,
      drawCount: allDraws.length,
      numberCount: allNumbers.length,
      numbers: allNumbers
    });
    analyze();
  } catch (error) {
    els.officialFetchStatus.value = error.message || "Official fetch failed";
  } finally {
    els.officialImportButton.disabled = false;
  }
}

function renderEmpty() {
  els.metricTopScore.textContent = "-";
  els.metricTopNumber.textContent = "No analysis yet";
  els.metricHotDigit.textContent = "-";
  els.metricHotDigitCopy.textContent = "Waiting for history";
  els.metricShape.textContent = "-";
  els.metricShapeCopy.textContent = "Waiting for history";
  els.candidateList.className = "candidate-list empty-state";
  els.candidateList.textContent = "Paste historical results and run the model.";
  els.heatmap.className = "heatmap empty-state";
  els.heatmap.textContent = "No data yet";
  els.insights.className = "insights empty-state";
  els.insights.textContent = "No insights yet";
}

function renderMetrics(topCandidate, stats, entryCount) {
  els.metricTopScore.textContent = topCandidate.score.toFixed(1);
  els.metricTopNumber.textContent = `${topCandidate.number} leads across ${entryCount} historical entries`;
  els.metricHotDigit.textContent = String(stats.hottestDigit);
  els.metricHotDigitCopy.textContent = `Seen ${stats.hottestDigitCount} times across all positions`;
  els.metricShape.textContent = formatShape(stats.topShape[0]);
  els.metricShapeCopy.textContent = `${stats.topShape[1]} entries matched this repetition pattern`;
}

function renderCandidates(shortlist) {
  els.candidateList.className = "candidate-list";
  els.candidateList.innerHTML = shortlist
    .map((candidate, index) => {
      const { positionScore, recentScore, pairScore } = candidate.components;
      return `
        <article class="candidate-card">
          <span class="candidate-rank">${index + 1}</span>
          <div>
            <div class="candidate-number">${candidate.number}</div>
            <div class="candidate-meta">
              position ${(positionScore * 100).toFixed(0)} | recency ${(recentScore * 100).toFixed(0)} | pair ${(pairScore * 100).toFixed(0)}
            </div>
          </div>
          <div class="candidate-score">
            <strong>${candidate.score.toFixed(1)}</strong>
            <span class="candidate-meta">pattern score</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderHeatmap(stats) {
  const positions = ["1st", "2nd", "3rd", "4th"];
  els.heatmap.className = "heatmap";
  els.heatmap.innerHTML = positions
    .map((label, rowIndex) => {
      const maxValue = stats.maxPosition[rowIndex] || 1;
      const cells = stats.position[rowIndex]
        .map((value, digit) => {
          const intensity = normalize(value, maxValue);
          const background = `rgba(13, 123, 115, ${0.12 + intensity * 0.45})`;
          return `<div class="heatmap-cell" style="background:${background}">${digit}<br>${value}</div>`;
        })
        .join("");
      return `<div class="heatmap-row"><span class="heatmap-label">${label}</span>${cells}</div>`;
    })
    .join("");
}

function renderInsights(shortlist, ranked, stats, entries, recentWindow) {
  const newest = entries.slice(-recentWindow);
  const averageTop = shortlist.reduce((sum, candidate) => sum + candidate.score, 0) / shortlist.length;
  const tenthScore = ranked[Math.min(9, ranked.length - 1)].score;
  const hotDigits = stats.overall
    .map((count, digit) => ({ digit, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4)
    .map(({ digit }) => digit)
    .join(", ");
  const recentTail = newest.slice(-8).join(", ");

  const cards = [
    `The shortlist leans on hot digits ${hotDigits}, especially where they line up with strong positional history and recent-window pressure.`,
    `Average shortlist score is ${averageTop.toFixed(1)}, versus ${tenthScore.toFixed(1)} for the number 10 ranked slot in the full 10,000-number sweep.`,
    `Recent sample tail: ${recentTail || "n/a"}. Exact repeats from the recent window are penalized, so the model avoids simply echoing the last few draws.`,
    `Most common repetition shape in the pasted history is ${formatShape(stats.topShape[0]).toLowerCase()}, which nudges similar number structures upward when other signals agree.`
  ];

  els.insights.className = "insights";
  els.insights.innerHTML = cards.map((copy) => `<div class="insight"><p>${copy}</p></div>`).join("");
}

function analyze() {
  const entries = refreshHistoryMeta();

  if (entries.length < 12) {
    els.parseStatus.textContent = "Add at least 12 past results for a meaningful pattern pass";
    renderEmpty();
    return;
  }

  els.parseStatus.textContent = "Analysis ready";

  const recentWindow = Number(els.recentWindow.value);
  const candidateCount = Number(els.candidateCount.value);
  const diversityThreshold = Number(els.diversityThreshold.value);
  const weights = getWeights();
  const stats = buildStats(entries, recentWindow);
  const ranked = [];

  for (let i = 0; i < 10000; i += 1) {
    const number = String(i).padStart(4, "0");
    ranked.push(scoreCandidate(number, stats, weights, recentWindow, entries.length));
  }

  ranked.sort((a, b) => b.score - a.score);
  const shortlist = diversify(ranked, candidateCount, diversityThreshold);

  renderMetrics(shortlist[0], stats, entries.length);
  renderCandidates(shortlist);
  renderHeatmap(stats);
  renderInsights(shortlist, ranked, stats, entries, recentWindow);
}

els.loadDemo.addEventListener("click", () => {
  els.historyInput.value = demoData;
  setImportStatus("Demo dataset", "Loaded into history");
  analyze();
});

els.importTrigger.addEventListener("click", () => {
  els.historyFileInput.click();
});

els.historyFileInput.addEventListener("change", (event) => {
  const [file] = event.target.files || [];
  if (file) {
    importHistoryFile(file);
  }
});

els.officialImportButton.addEventListener("click", importOfficialHistory);

els.importDropzone.addEventListener("click", () => {
  els.historyFileInput.click();
});

els.importDropzone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    els.historyFileInput.click();
  }
});

["dragenter", "dragover"].forEach((eventName) => {
  els.importDropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.importDropzone.classList.add("drag-active");
  });
});

["dragleave", "dragend", "drop"].forEach((eventName) => {
  els.importDropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    if (eventName === "drop") {
      const [file] = event.dataTransfer.files || [];
      if (file) {
        importHistoryFile(file);
      }
    }
    els.importDropzone.classList.remove("drag-active");
  });
});

els.analyzeButton.addEventListener("click", analyze);
els.presetSelect.addEventListener("change", (event) => {
  applyPreset(event.target.value);
});

Object.values(sliders).forEach(({ input }) => {
  input.addEventListener("input", updateSliderLabels);
});

els.historyInput.addEventListener("input", () => {
  refreshHistoryMeta();
});

applyPreset("balanced");
updateSliderLabels();
updateAsOfUi(getAsOfCopy());
setImportStatus("None yet", "Waiting for file");
refreshHistoryMeta();
renderEmpty();

const cachedOfficialHistory = readOfficialHistoryCache();
if (cachedOfficialHistory) {
  applyImportedEntries(cachedOfficialHistory.numbers, "replace");
  setImportStatus(
    "Singapore Pools official history",
    `${cachedOfficialHistory.numberCount} values from ${cachedOfficialHistory.drawCount} draws`
  );
  els.officialFetchStatus.value = `Loaded cached full history through draw ${cachedOfficialHistory.latestDrawNumber}`;
  analyze();
} else {
  importOfficialHistory();
}
