# WXML 检查：标签配对 + wx:if / wx:elif / wx:else 必须是相邻兄弟
import re, sys, glob
TAG = re.compile(r'<(/?)([a-zA-Z][\w-]*)((?:"[^"]*"|\'[^\']*\'|[^>"\'])*?)(/?)>', re.S)

def kind_of(a):
    if re.search(r'wx:elif(?![\w-])', a): return 'elif'
    if re.search(r'wx:else(?![\w-])', a): return 'else'
    if re.search(r'wx:if(?![\w-])', a):   return 'if'
    return 'other'

bad = 0
for f in sorted(glob.glob('pages/*/*.wxml')):
    src = open(f, encoding='utf-8').read()
    src = re.sub(r'<!--.*?-->', '', src, flags=re.S)
    levels = [{'tag': '#root', 'prev': 'other', 'prev_ln': 0}]
    ok = True
    for m in TAG.finditer(src):
        close, name, attr, self = m.groups()
        ln = src.count('\n', 0, m.start()) + 1
        if close:
            if len(levels) < 2 or levels[-1]['tag'] != name:
                print('  标签不匹配 %s:%d  </%s>，当前打开的是 <%s>' % (f, ln, name, levels[-1]['tag']))
                bad += 1; ok = False; break
            levels.pop()
            continue
        k = kind_of(attr)
        cur = levels[-1]
        if k in ('elif', 'else') and cur['prev'] not in ('if', 'elif'):
            print('  链断裂 %s:%d  wx:%s 的上一个兄弟是 %s（行 %d）' % (f, ln, k, cur['prev'], cur['prev_ln']))
            bad += 1
        cur['prev'], cur['prev_ln'] = k, ln
        if not self:
            levels.append({'tag': name, 'prev': 'other', 'prev_ln': ln})
    if ok and len(levels) > 1:
        print('  未闭合 %s: %s' % (f, [l['tag'] for l in levels[1:]])); bad += 1
print('WXML 检查', 'FAIL' if bad else 'OK')
sys.exit(1 if bad else 0)
