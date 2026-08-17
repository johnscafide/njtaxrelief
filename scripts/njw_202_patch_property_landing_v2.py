from pathlib import Path

base = Path(__file__).with_name('njw_202_patch_property_landing.py')
source = base.read_text(encoding='utf-8')
source = source.replace(
    "'<span id=\"ins-munis\">565</span>', '<span id=\"ins-munis\">564</span>'",
    "'<b>565</b><span>Municipalities</span>', '<b>564</b><span>Municipalities</span>'",
)
source = source.replace(
    "'<span id=\"ins-days\">-</span><small>Days to the appeal deadline</small>',\n    '<span id=\"ins-days\">Apr 1</span><small id=\"ins-days-label\">General appeal deadline</small>'",
    "'<b id=\"ins-days\">-</b><span>Days to the appeal deadline</span>',\n    '<b id=\"ins-days\">Apr 1</b><span id=\"ins-days-label\">General appeal deadline</span>'",
)
exec(compile(source, str(base), 'exec'), {'__file__': str(base), '__name__': '__main__'})
