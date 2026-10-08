const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function homeLookupBox(townName, id) {
  const fieldId = id || 'wd-look-address';
  const label = townName ? `Look up a home in ${esc(townName)}` : 'Look up a home';
  const place = String(townName || '').replace(/\s+(town|borough|village)$/i, '').trim();
  return `<form class="wd-look" action="/" method="get" role="search" data-town="${esc(place)}" onsubmit="var i=this.elements.address,v=i.value.trim(),t=this.getAttribute('data-town');if(t&&v&&v.indexOf(',')<0)i.value=v+', '+t+', NJ'">
  <label for="${fieldId}">${label}</label>
  <div class="wd-look-row"><input id="${fieldId}" name="address" type="text" autocomplete="street-address" placeholder="Street address" required><button type="submit">Search</button></div>
</form>`;
}

module.exports = { homeLookupBox };
