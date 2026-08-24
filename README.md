# Joplin to n8n (joplin2n8n)

Joplin의 노트 내용을 외부 자동화 툴인 n8n(또는 커스텀 서버) 웹훅으로 전송하고, 그 응답을 받아와 노트를 수정하거나 결과를 표시해주는 Joplin 플러그인입니다.

![Plugin Overview Screenshot](docs/images/overview.png)

## 📱 지원 환경
- **PC** (Windows, Linux)
- **모바일** (Android)
- *macOS 및 iOS는 테스트 환경이 없어 작동을 100% 보장하지 못합니다.*

---

## 📥 설치 방법

### 공식 설치 (플러그인 스토어)
1. Joplin 메뉴에서 `도구(Tools)` -> `설정(Options)` -> `플러그인(Plugins)`으로 이동합니다.
2. 검색창에 `joplin2n8n`을 검색합니다.
3. 설치 버튼을 누르고 Joplin을 재시작합니다.

### 수동 설치 (파일로 설치)
1. GitHub Releases 페이지에서 최신 `com.bonik.joplin2n8n.jpl` 파일을 다운로드합니다.
2. Joplin 메뉴에서 `도구(Tools)` -> `설정(Options)` -> `플러그인(Plugins)`으로 이동합니다.
3. 플러그인 관리 화면 상단의 `⚙️ (톱니바퀴)` 아이콘을 누르고 `파일에서 설치(Install from file)`를 선택합니다.
4. 다운로드한 `.jpl` 파일을 선택하고 Joplin을 재시작합니다.

---

## ⚙️ 웹훅 등록 및 설정

플러그인 설치 후 `도구(Tools)` -> `joplin2n8n 설정 변경` 메뉴를 클릭하여 웹훅을 등록합니다.

![Webhook Settings Dialog](docs/images/settings_webhook.png)

- **요청 URL**: 요청을 받을 n8n 웹훅 주소를 입력합니다.
  ```text
  https://n8n.example.com/webhook/j2n
  ```
- **인증 방식**: `없음`, `Basic Auth`, `Header Auth` 중 서버 구성에 맞게 선택합니다.
- **응답 처리 방법**: 
  - `성공 여부만 표시`: 팝업으로 전송 성공/실패 여부만 띄웁니다.
  - `응답 TEXT/MD를 표시`: 응답받은 텍스트/마크다운을 보여주며, 필요시 기존 노트를 이 내용으로 교체할 수 있습니다.
  - `응답 HTML을 표시`: 응답받은 HTML을 팝업 화면에 렌더링해서 보여줍니다.

---

## 🛠️ 플러그인 옵션

Joplin의 기본 설정 창 (`도구` -> `설정` -> `joplin2n8n`)에서 세부 옵션을 조절할 수 있습니다.

![Joplin Plugin Options](docs/images/options.png)

### 전송 전 본문 클립보드에 복사
- 데이터를 웹훅으로 전송하기 직전에 **원본 노트 본문을 클립보드에 자동으로 복사**합니다. (모바일에서 Undo 기능을 대체하는 안전장치로 유용합니다.)

### 전송 버튼 표시 위치
사용하지 않는 메뉴는 체크 해제하여 숨길 수 있습니다.
- **노트 목록 우클릭 메뉴에 표시** (PC 전용)
- **노트 본문 상단 툴바에 표시** (비행기 아이콘 / 모바일은 `···` 메뉴에 표시)
- **도구(Tools) 메뉴에 표시** (PC 전용)

---

## 🚀 전송 요청 방법

![Sending Action](docs/images/send_action.png)

### PC 환경
- 상단 **도구(Tools)** 메뉴에서 전송할 웹훅 선택
- 노트 목록에서 **우클릭** 후 컨텍스트 메뉴에서 전송
- 노트 에디터 우측 상단의 **비행기 툴바 아이콘** 클릭

### 모바일 환경
- 우측 상단 **도구(···)** 메뉴를 열고 등록한 웹훅 이름을 클릭

---

## 🔧 N8N 워크플로우 설정

N8N 워크플로우는 사용자의 상황과 목적에 맞게 직접 구성하셔야 합니다.
*(반드시 n8n을 사용할 필요는 없으며, Python FastAPI나 Node.js Fastify 등을 이용해 커스텀 서버를 직접 구축하여 사용해도 완벽하게 호환됩니다.)*

**기본 워크플로우 구조:**
`Webhook 노드` ➔ `필요한 처리 노드(AI, API 등)` ➔ `Respond to Webhook 노드`

---

## 💡 joplin2n8n 활용 예시

이 플러그인을 활용하여 나만의 자동화 시스템을 구축해 보세요!

- 📧 **메일 전송**: 작성한 노트를 즉시 이메일로 발송
- 💬 **메신저 알림**: 슬랙, 텔레그램, 디스코드 등으로 전송
- 📝 **발행 시스템**: 워드프레스 블로그, 노션(Notion) 등으로 포스팅 발행
- 🔄 **파일 변환**: `.md` 문서를 `.pdf`, `html`, `json`, `xlsx` 등으로 변환하여 리턴
- ☁️ **클라우드 백업**: 특정 노트를 Google Drive나 외부 저장소에 백업
- 🤖 **AI 파이프라인**: 
  - 맞춤법 교정 및 요약
  - 번역본 자동 작성
  - 노트 내용과 관련된 외부 자료 조사 리포트 생성
  - 텍스트 기반 그래픽 이미지 생성 또는 음악 생성
- 📊 **RAG (검색 증강 생성)**: 노트 데이터를 임베딩(Embedding)하여 벡터 DB에 저장

---

## 꿀팁 (Tips)

### 응답(Response) 옵션 선택 가이드
- **성공 여부만 표시**: 백그라운드로 처리되는 작업(메일 전송, 백업 등)의 성공/실패 여부만 확인할 때 유용합니다.
- **응답 TEXT/MD를 표시**: AI 교정이나 번역 등, **마크다운 노트 본문을 변경(교체)**하는 작업에 사용하세요. 팝업 하단에 [노트 본문을 응답으로 교체] 버튼이 활성화됩니다.
- **응답 HTML을 표시**: 차트, 대시보드, 복잡한 웹 레이아웃 등 화려한 결과물을 팝업으로 렌더링해서 확인하고 싶을 때 사용합니다. (Joplin 샌드박스 정책상 외부 스크립트 실행 등에 제약이 있을 수 있습니다.)

### n8n 쿼리(Query)를 이용해 단일 웹훅으로 다중 라우팅하기
웹훅 개수를 무한정 늘리는 대신, URL 파라미터를 활용하고 n8n 내부에서 **Switch 노드**로 분기하면 URL 1개로 다양한 자동화를 처리할 수 있습니다.

```text
https://n8n.example.com/webhook/j2n?mode=email
https://n8n.example.com/webhook/j2n?mode=ai&act=translate
https://n8n.example.com/webhook/j2n?mode=wordpress&act=publish
https://n8n.example.com/webhook/j2n?mode=wordpress&act=draft
https://n8n.example.com/webhook/j2n?mode=convert&type=pdf
```

---

## 제작 정보

- **라이선스 (License)**: MIT License
- **제작자**: BoniK ([mail@bonik.me](mailto:mail@bonik.me) / [https://bonik.me](https://bonik.me))
- **☕ 후원하기**: [Buy me a coffee](https://buymeacoffee.com/bonik)
