function calculateHealthResult(input) {
  let score = 0;
  const reasons = [];
  if (input.temperature >= 39.5) { score += 45; reasons.push('elevated temperature'); }
  else if (input.temperature >= 39) { score += 20; reasons.push('slightly elevated temperature'); }
  if (input.appetite === 'reduced') { score += 20; reasons.push('reduced appetite'); }
  if (input.appetite === 'none') { score += 35; reasons.push('loss of appetite'); }
  if (input.behavior === 'quiet') { score += 10; reasons.push('quiet behavior'); }
  if (input.behavior === 'lethargic') { score += 25; reasons.push('lethargy'); }
  if (input.symptoms) { score += 20; reasons.push('reported symptoms'); }

  const riskLevel = score >= 60 ? 'High' : score >= 25 ? 'Medium' : 'Low';
  const recommendation = riskLevel === 'High'
    ? 'Contact a veterinarian promptly and keep the animal separated from the herd.'
    : riskLevel === 'Medium'
      ? 'Monitor the animal closely and repeat the check within 24 hours.'
      : 'Continue routine care and monitor for any changes.';

  return { riskLevel, riskScore: Math.min(score, 100), recommendation, reasons };
}

module.exports = { calculateHealthResult };