const $ = (id) => document.getElementById(id);
function show(hasKey) { $('need-key').hidden = hasKey; $('has-key').hidden = !hasKey; }
chrome.storage.local.get('key').then(({ key }) => show(Boolean(key)));
$('save').addEventListener('click', async () => {
  const key = $('key').value.trim();
  if (!/^wdg_ext_[0-9a-f]{48}$/.test(key)) { $('msg').textContent = 'That doesn\'t look like a Watchdog extension key. Copy it again from the Agent Desk.'; return; }
  await chrome.storage.local.set({ key });
  chrome.runtime.sendMessage({ type: 'key-changed' });
  $('key').value = '';
  $('msg').textContent = 'Saved.';
  show(true);
});
$('remove').addEventListener('click', async () => {
  await chrome.storage.local.remove('key');
  chrome.runtime.sendMessage({ type: 'key-changed' });
  $('msg').textContent = 'Key removed.';
  show(false);
});
