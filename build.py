"""src/의 style.css와 app.js를 합쳐 배포용 index.html과 미리보기용 preview.html을 만듭니다."""
import pathlib
root = pathlib.Path(__file__).parent
css = (root / 'src/style.css').read_text()
js = (root / 'src/app.js').read_text()
head = '''<title>일만사 다있소</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=swap">
<style>
''' + css + '''</style>'''
body = '''<div id="app"></div>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js"></script>
<script>
''' + js + '''</script>
'''
(root / 'preview.html').write_text(head + '\n' + body)
(root / 'index.html').write_text('''<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
''' + head + '''
</head>
<body>
''' + body + '''</body>
</html>
''')
print('built')
