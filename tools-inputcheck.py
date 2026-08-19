# 检查每个 input / textarea 是否有明确高度（含 .parent input 这类后代选择器）
import re, glob, os, sys
def rules(page):
    txt = ''
    p='pages/%s/%s.wxss'%(page,page)
    if os.path.exists(p): txt += open(p,encoding='utf-8').read()
    txt += open('app.wxss',encoding='utf-8').read()
    cls, tag = set(), set()
    for m in re.finditer(r'([^{}]+)\{([^}]*)\}', txt, re.S):
        if not re.search(r'(^|;|\s)(height|min-height)\s*:', m.group(2)): continue
        for sel in m.group(1).split(','):
            sel = sel.strip()
            if re.search(r'\b(input|textarea)\s*$', sel): tag.add(sel.split()[-1])
            for c in re.findall(r'\.([\w-]+)', sel): cls.add(c)
    return cls, tag
bad = 0
for f in sorted(glob.glob('pages/*/*.wxml')):
    page = f.split('/')[1]
    cls, tag = rules(page)
    for m in re.finditer(r'<(input|textarea)\b([^>]*)>', open(f,encoding='utf-8').read()):
        c = re.search(r'class="([^"]*)"', m.group(2))
        c = c.group(1) if c else ''
        if any(x in cls for x in c.split()) or m.group(1) in tag: continue
        ln = open(f,encoding='utf-8').read()[:m.start()].count('\n')+1
        print('  ❌ %s:%d  <%s class="%s">' % (f, ln, m.group(1), c)); bad += 1
print('输入框高度检查', 'FAIL %d 处' % bad if bad else 'OK — 全部有明确高度')
sys.exit(1 if bad else 0)
