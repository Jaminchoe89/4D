import historyService from "../official-history-service.js";

const { fetchOfficialHistory } = historyService;

function jsonResponse(payload, status) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

export default async function handler(request) {
  try {
    const url = new URL(request.url);
    const requestedDraws = Number.parseInt(url.searchParams.get("draws") || "180", 10);
    const requestedStartDraw = Number.parseInt(url.searchParams.get("startDraw") || "", 10);
    const drawLimit = Math.min(2500, Math.max(1, Number.isFinite(requestedDraws) ? requestedDraws : 180));
    const history = await fetchOfficialHistory(drawLimit, {
      startDraw: Number.isFinite(requestedStartDraw) ? requestedStartDraw : undefined
    });
    return jsonResponse(history, 200);
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "Unable to fetch official history"
      },
      502
    );
  }
}
