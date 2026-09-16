function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function requiredString(value, field, maxLength = 120) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    const error = new Error(`${field} is required and must be ${maxLength} characters or fewer`);
    error.status = 400;
    throw error;
  }
  return value.trim();
}

function healthCheckInput(body) {
  const temperature = Number(body.temperature);
  if (!Number.isFinite(temperature) || temperature < 30 || temperature > 45) {
    const error = new Error('Temperature must be a number between 30 and 45 °C');
    error.status = 400;
    throw error;
  }

  const appetite = requiredString(body.appetite, 'Appetite', 30).toLowerCase();
  const behavior = requiredString(body.behavior, 'Behavior', 30).toLowerCase();
  if (!['normal', 'reduced', 'none'].includes(appetite)) {
    const error = new Error('Appetite must be normal, reduced, or none');
    error.status = 400;
    throw error;
  }
  if (!['active', 'quiet', 'lethargic'].includes(behavior)) {
    const error = new Error('Behavior must be active, quiet, or lethargic');
    error.status = 400;
    throw error;
  }

  return {
    animalName: requiredString(body.animalName, 'Animal name', 80),
    animalType: requiredString(body.animalType, 'Animal type', 30).toLowerCase(),
    temperature,
    appetite,
    behavior,
    symptoms: typeof body.symptoms === 'string' ? body.symptoms.trim().slice(0, 500) : ''
  };
}

module.exports = { isValidEmail, healthCheckInput };