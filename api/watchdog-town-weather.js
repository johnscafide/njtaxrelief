/* Current weather for one town (by municipality code), for the quiet date
   line on the home feed ("Sunny 77°"). Address and coordinate lookups for the
   Dashboard stay in api/watchdog-weather.js. Data: National Weather Service
   hourly forecast (api.weather.gov; public, no key). The town's forecast grid
   is looked up once a week and the forecast is kept for 20 minutes per grid
   cell, and the answer is cached at the edge for 15 minutes, so visitors
   almost never wait on the weather service. The feed paints first and fills
   this in after. */
const fs = require('fs');
const path = require('path');

const MINUTE = 60 * 1000;
const WEEK = 7 * 24 * 60 * MINUTE;
const USER_AGENT = 'WatchdogIndex/1.0 (+https://www.watchdogindex.com)';

let towns = null;
function townList() {
  if (!towns) towns = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'property/data/home-feed-towns.json'), 'utf8')).towns || {};
  return towns;
}

const memo = new Map();
function cached(key, ttl, load) {
  const hit = memo.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = Promise.resolve().then(load).catch(error => {
    memo.delete(key);
    throw error;
  });
  memo.set(key, { value, expires: Date.now() + ttl });
  if (memo.size > 600) memo.delete(memo.keys().next().value);
  return value;
}

async function getJson(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(url, { headers: { Accept: 'application/geo+json', 'User-Agent': USER_AGENT }, signal: controller.signal });
    if (!response.ok) throw new Error(`http ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/* The weather service's wording ("Slight Chance Rain Showers") boiled down to
   a couple of words and a Font Awesome icon name. */
function describe(short, isDaytime) {
  const s = String(short || '');
  const day = isDaytime !== false;
  const odds = (word, label) => (/chance|slight/i.test(s) ? `Chance of ${word}` : /likely/i.test(s) ? `${label} likely` : label);
  if (/thunder|t-storm/i.test(s)) return { text: odds('storms', 'Storms'), icon: 'cloud-bolt' };
  if (/sleet|freezing|ice|wintry/i.test(s) || (/snow/i.test(s) && /rain/i.test(s))) return { text: 'Wintry mix', icon: 'snowflake' };
  if (/snow|flurr|blizzard/i.test(s)) return { text: odds('snow', 'Snow'), icon: 'snowflake' };
  if (/rain|shower|drizzle/i.test(s)) return { text: odds('rain', 'Rain'), icon: /heavy/i.test(s) ? 'cloud-showers-heavy' : 'cloud-rain' };
  if (/fog|mist/i.test(s)) return { text: 'Foggy', icon: 'smog' };
  if (/haze|smoke/i.test(s)) return { text: 'Hazy', icon: 'smog' };
  if (/partly sunny/i.test(s)) return { text: 'Partly sunny', icon: 'cloud-sun' };
  if (/mostly sunny/i.test(s)) return { text: 'Mostly sunny', icon: 'cloud-sun' };
  if (/mostly clear/i.test(s)) return { text: 'Mostly clear', icon: day ? 'cloud-sun' : 'cloud-moon' };
  if (/partly cloudy/i.test(s)) return { text: 'Partly cloudy', icon: day ? 'cloud-sun' : 'cloud-moon' };
  if (/mostly cloudy/i.test(s)) return { text: 'Mostly cloudy', icon: 'cloud' };
  if (/cloudy|overcast/i.test(s)) return { text: 'Cloudy', icon: 'cloud' };
  if (/sunny|clear|fair/i.test(s)) return { text: day ? 'Sunny' : 'Clear', icon: day ? 'sun' : 'moon' };
  if (/wind|breezy|blustery/i.test(s)) return { text: 'Windy', icon: 'wind' };
  return { text: s ? s.charAt(0) + s.slice(1).toLowerCase() : '', icon: day ? 'cloud-sun' : 'cloud-moon' };
}

async function currentWeather(lat, lon) {
  const point = `${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`;
  const hourlyUrl = await cached(`point:${point}`, WEEK, async () => {
    const data = await getJson(`https://api.weather.gov/points/${point}`, 4000);
    const url = data && data.properties && data.properties.forecastHourly;
    if (!url || !/^https:\/\/api\.weather\.gov\//.test(url)) throw new Error('no forecast grid');
    return url;
  });
  const periods = await cached(`hourly:${hourlyUrl}`, 20 * MINUTE, async () => {
    const data = await getJson(hourlyUrl, 5000);
    const list = data && data.properties && data.properties.periods;
    if (!Array.isArray(list) || !list.length) throw new Error('no forecast periods');
    return list.slice(0, 8).map(p => ({ start: p.startTime, end: p.endTime, temp: p.temperature, unit: p.temperatureUnit, short: p.shortForecast, day: p.isDaytime }));
  });
  const now = Date.now();
  const period = periods.find(p => Date.parse(p.start) <= now && now < Date.parse(p.end)) || periods[0];
  let temp = Number(period.temp);
  if (!Number.isFinite(temp)) throw new Error('no temperature');
  if (period.unit === 'C') temp = temp * 9 / 5 + 32;
  const label = describe(period.short, period.day);
  return { temp: Math.round(temp), text: label.text, icon: label.icon, asOf: period.start };
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET');
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }
  const code = String((req.query && req.query.town) || '').replace(/\D/g, '').slice(0, 4);
  const town = townList()[code];
  if (!town || !Number.isFinite(Number(town.lat)) || !Number.isFinite(Number(town.lon))) {
    res.statusCode = 404;
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.end(JSON.stringify({ error: 'Unknown town' }));
  }
  try {
    const weather = await currentWeather(town.lat, town.lon);
    res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=900, stale-while-revalidate=3600');
    return res.end(JSON.stringify({ town: code, ...weather }));
  } catch (_error) {
    res.statusCode = 503;
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=120');
    return res.end(JSON.stringify({ error: 'Weather is unavailable right now.' }));
  }
};

module.exports.describe = describe;
