# 일만사 다있소

MR이 현장에서 일만사·웰체크 툴, 브로셔, 지침공문, 표준멘트를 바로 꺼내 쓰는 사내 툴입니다.

## 구성

| 파일 | 역할 |
|---|---|
| `index.html` | 배포되는 화면 (Netlify가 이 파일을 띄웁니다) |
| `src/app.js`, `src/style.css` | 화면 원본. 고친 뒤 `python3 build.py`로 `index.html`을 다시 만듭니다 |
| `supabase/setup.sql` | Supabase 초기 설정 (표, 보안 규칙, 첫 관리자 계정). 새 프로젝트에서 한 번만 실행 |

## 연결

`src/app.js` 맨 위의 `SUPABASE_URL`, `SUPABASE_KEY`에 Supabase의 Project URL과 Publishable key를 넣고 `python3 build.py`를 실행합니다. 비워두면 저장되지 않는 미리보기 모드로 돌아갑니다.

Secret key(service_role)는 절대 넣지 않습니다.

## 기록

- 사용 기록(열기, 즐겨찾기, 제안에 담기, 거래처에서 열기, 멘트 복사, 요청)은 사무소·사업부 단위로만 집계해서 관리자에게 보입니다. 개인별 기록은 관리자도 볼 수 없습니다.
- 계정은 관리자 화면에서만 만듭니다. Supabase의 "Allow new users to sign up"은 꺼둡니다.
