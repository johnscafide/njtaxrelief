/* Same-origin weather proxy for Watchdog app surfaces.
   Keeps browser CSP narrow while using the public National Weather Service API. */
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  var lat = Number(req.query && req.query.lat);
  var lon = Number(req.query && req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 38.7 || lat > 41.5 || lon < -75.7 || lon > -73.8) {
    return res.status(400).json({ error: 'Valid New Jersey coordinates are required' });
  }

  var headers = {
    'Accept': 'application/geo+json',
    'User-Agent': 'Watchdog Property Intelligence (https://www.watchdogindex.com)'
  };

  try {
    var pointsUrl = 'https://api.weather.gov/points/' + lat.toFixed(4) + ',' + lon.toFixed(4);
    var pointsResponse = await fetch(pointsUrl, { headers: headers });
    if (!pointsResponse.ok) throw new Error('NWS points ' + pointsResponse.status);
    var points = await pointsResponse.json();
    var forecastUrl = points && points.properties && points.properties.forecastHourly;
    if (!forecastUrl) throw new Error('NWS hourly forecast unavailable');

    var forecastResponse = await fetch(forecastUrl, { headers: headers });
    if (!forecastResponse.ok) throw new Error('NWS forecast ' + forecastResponse.status);
    var forecast = await forecastResponse.json();
    var current = forecast && forecast.properties && forecast.properties.periods && forecast.properties.periods[0];
    if (!current) throw new Error('NWS current period unavailable');

    res.setHeader('Cache-Control', 'public, max-age=120, s-maxage=600, stale-while-revalidate=900');
    return res.status(200).json({
      temperature: current.temperature,
      temperatureUnit: current.temperatureUnit || 'F',
      shortForecast: current.shortForecast || 'Local conditions',
      windSpeed: current.windSpeed || null,
      startTime: current.startTime || null,
      source: 'National Weather Service'
    });
  } catch (error) {
    console.error('watchdog-weather', error && error.message || error);
    return res.status(502).json({ error: 'Weather temporarily unavailable' });
  }
};
