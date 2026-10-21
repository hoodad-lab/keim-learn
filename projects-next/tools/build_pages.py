#!/usr/bin/env python3
"""Builds one shareable, search-friendly page per project: projects-next/p/<id>/index.html
plus projects-next/sitemap.xml. Re-run after editing map/projects.json."""
import json, html, os, re, shutil, urllib.parse
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = 'https://learn.keim.com.au/' + os.path.basename(ROOT) + '/'
FORM = 'https://form.jotform.com/262935688862072'
TL = {'Residential': 'Homes & apartments', 'Transport': 'Infrastructure', 'Health': 'Healthcare', 'Mural': 'Murals & art', 'Hospitality': 'Hotels'}
e = lambda x: html.escape(str(x or ''), quote=True)
def yr(y): return '' if not y or y.lower() == 'none' else re.sub(r'^by\s+', 'c. ', y)
def prods(p):
    s = re.sub(r'\s*\(.*?\)', '', p.get('products') or '').strip()
    return s if s and s.lower() not in ('keim product', 'products') else 'KEIM product'
def img(p, absolute):
    i = p.get('img')
    if not i: return ''
    if i.startswith('http'): return i
    return (BASE + 'map/img/' + i) if absolute else ('../../map/img/' + i)
d = json.load(open(os.path.join(ROOT, 'map', 'projects.json')))
out = os.path.join(ROOT, 'p'); shutil.rmtree(out, ignore_errors=True)
urls = []
for p in d:
    pid = p['id']; t = TL.get(p['type'], p['type']); loc = ', '.join(x for x in [p.get('place'), p.get('region') if p['country'] == 'Australia' else p.get('country')] if x)
    pr = prods(p); y = yr(p.get('year'))
    story = (p.get('story') or '').strip()
    desc = story[:155] if story else f"{p['name']}, {loc}: {t.lower()} project finished with {pr}. KEIM mineral paint, part of the building for generations."
    title = f"{p['name']} · {pr} | KEIM mineral paint projects"
    im_abs = img(p, True) or BASE.replace('projects-next/', '') + 'og/projects.png'
    facts = [('Location', loc), ('Year', y), ('Sector', t), ('KEIM products', pr), ('Colours', p.get('colours')), ('Architect', p.get('architect')), ('Artist', p.get('artist')), ('Builder', p.get('builder')), ('Applicator', p.get('applicator')), ('Area', p.get('area'))]
    fh = ''.join(f'<div class="f"><small>{k}</small><div>{e(v)}</div></div>' for k, v in facts if v)
    credit = p.get('credit') or (f"{p.get('iby')}, {p.get('ilic')}, via Wikimedia Commons" if p.get('iby') else '')
    ld = {'@context': 'https://schema.org', '@type': 'CreativeWork', 'name': p['name'], 'about': {'@type': 'Place', 'name': p['name'], 'address': loc, 'geo': {'@type': 'GeoCoordinates', 'latitude': p['lat'], 'longitude': p['lon']}} if not p.get('priv') else {'@type': 'Place', 'name': p['name'], 'address': loc},
          'description': desc, 'image': im_abs, 'publisher': {'@type': 'Organization', 'name': 'KEIM Australia', 'url': 'https://www.keim.com.au'}, 'keywords': f"mineral paint, {pr}, {t}, {loc}"}
    q = '?' + urllib.parse.urlencode({'q12': p['name'] + (', ' + p['place'] if p.get('place') else '')})
    page = f'''<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(title)}</title><meta name="description" content="{e(desc)}"><link rel="canonical" href="{BASE}p/{pid}/">
<meta property="og:type" content="article"><meta property="og:site_name" content="KEIM Australia"><meta property="og:title" content="{e(p['name'])} · {e(pr)}"><meta property="og:description" content="{e(desc)}"><meta property="og:image" content="{e(im_abs)}"><meta property="og:url" content="{BASE}p/{pid}/"><meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg"><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Inter+Tight:wght@400;500;600&display=swap" rel="stylesheet">
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
<style>:root{{--ink:#07090d;--line:rgba(255,255,255,.12);--red:#D51F24;--sand:#d8c7ae}}*{{box-sizing:border-box}}body{{margin:0;background:var(--ink);color:#e9e7e3;font:400 16px/1.6 "Inter Tight",system-ui,sans-serif}}
a{{color:inherit}}.top{{display:flex;justify-content:space-between;align-items:center;padding:14px 20px;border-bottom:1px solid var(--line);font:500 12px/1 "Inter Tight";letter-spacing:.14em;text-transform:uppercase}}.top img{{height:34px}}
.hero{{position:relative;aspect-ratio:16/8;max-height:70vh;background:#1a1d22 center/cover no-repeat}}.hero::after{{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(7,9,13,0) 45%,var(--ink))}}
.w{{max-width:920px;margin:0 auto;padding:0 20px 60px}}.k{{color:var(--sand);font:600 11px/1 "Inter Tight";letter-spacing:.18em;text-transform:uppercase;margin-top:-30px;position:relative;z-index:2}}
h1{{font:400 clamp(38px,6vw,64px)/1.02 "Instrument Serif",serif;color:#fff;margin:12px 0 0}}h1::after{{content:"";display:block;width:72px;height:2px;background:var(--red);margin-top:18px}}
.fs{{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;margin:28px 0}}.f{{border:1px solid var(--line);border-radius:12px;padding:14px 16px}}.f small{{display:block;color:#9a9893;font:600 10px/1 "Inter Tight";letter-spacing:.16em;text-transform:uppercase;margin-bottom:6px}}
.story{{font-size:18px;color:#d6d3cd}}.acts{{display:flex;gap:10px;flex-wrap:wrap;margin:26px 0}}.b{{display:inline-flex;align-items:center;height:46px;padding:0 22px;border-radius:999px;font:600 12px/1 "Inter Tight";letter-spacing:.14em;text-transform:uppercase;text-decoration:none;border:1.5px solid #fff}}.b.r{{background:var(--red);border-color:var(--red);color:#fff}}
.src{{color:#8d8b86;font-size:13px}}</style></head><body>
<div class="top"><a href="../../">← All projects</a><a href="https://www.keim.com.au"><img src="../../keim-logo-neg.png" alt="KEIM"></a></div>
<div class="hero" style="background-image:url('{e(img(p, False) or '../../map/img/private-residence.svg')}')" role="img" aria-label="{e(p['name'])}"></div>
<main class="w"><div class="k">{e(t)} · {e(loc)}</div><h1>{e(p['name'])}</h1>{f'<p class="story">{e(story)}</p>' if story else ''}
<div class="fs">{fh}</div>
<div class="acts"><a class="b r" href="{FORM}{q}">Specify this look</a><a class="b" href="../../#p={pid}">See it with all projects</a><a class="b" href="../../map/#{pid}">Show on the map</a>{f'<a class="b" href="{e(p["link"])}" rel="noopener">Full case study ↗</a>' if p.get('link') else ''}</div>
<p class="src">Source: {e(p.get('src') or 'KEIM')}{' · Photo: ' + e(credit) if credit else ''}{' · Private home, shown by suburb only.' if p.get('priv') else ''}</p>
<p class="src">KEIM Australia · Unit 7, 19 McCauley Street, Matraville NSW · <a href="tel:+61297487160">(02) 9748 7160</a> · <a href="mailto:info@keim.com.au">info@keim.com.au</a></p></main>
<script async defer src="//js.hs-scripts.com/47417993.js"></script></body></html>'''
    os.makedirs(os.path.join(out, pid), exist_ok=True)
    open(os.path.join(out, pid, 'index.html'), 'w').write(page); urls.append(f'{BASE}p/{pid}/')
sm = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + f'<url><loc>{BASE}</loc><priority>1.0</priority></url>\n' + ''.join(f'<url><loc>{u}</loc></url>\n' for u in urls) + '</urlset>\n'
open(os.path.join(ROOT, 'sitemap.xml'), 'w').write(sm); print(len(urls), 'pages')
