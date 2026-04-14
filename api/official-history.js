const { fetchOfficialHistory } = require("../official-history-service");

module.exports = async (req, res) => {
  const requestedDraws = Number.parseInt(req.query.draws || "180", 10);
  const drawLimit = Math.min(2500, Math.max(1, Number.isFinite(requestedDraws) ? requestedDraws : 180));

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  try {
    const history = await fetchOfficialHistory(drawLimit);
    res.status(200).send(JSON.stringify(history));
  } catch (error) {
    res.status(502).send(JSON.stringify({ error: error.message || "Unable to fetch official history" }));
  }
};
