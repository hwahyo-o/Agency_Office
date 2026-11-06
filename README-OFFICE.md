# AI 팀 오피스

밝고 미니멀한 로컬 AI 업무 공간입니다. 요청, 할 일, 업무 공간, 자동 업무, AI 팀, 스킬, 커넥터, 라이브러리, 앱, 프로젝트, 전체 작업 내역을 별도 페이지로 제공합니다. 첫 실행에는 예시 작업·프로젝트를 넣지 않습니다.

## Android 앱

Android 앱은 Cordova 컨테이너 안에서 Node 모바일 런타임과 로컬 업무 서버를 실행하도록 구성합니다. Android 기기에 Node.js를 따로 설치하지 않습니다. 계정 연결은 브라우저의 시스템 인증 탭에서 진행하고, 인증이 끝나면 앱 딥링크로 돌아옵니다. GitHub Actions가 생성한 `AI-Team-Office-Android-debug` 빌드 아티팩트의 APK를 Android 기기에 설치할 수 있습니다.

커넥터 카탈로그에는 Google Workspace, Microsoft 365, Notion, GitHub, Slack 등 OAuth 지원 서비스를 표시합니다. 카드에 표시된 OAuth 앱 등록과 리디렉션 설정이 준비되어야 실제 권한 동의를 시작할 수 있습니다. 각 공급자별 앱 등록 정보는 앱마다 다르므로, 연결이 되었다고 가장하지 않습니다.

## Windows 앱 받기

1. [최신 Windows 앱 다운로드](https://github.com/hwahyo-o/Agency_Office/releases/latest)에서 `AI-Team-Office-Windows-x64.zip`을 받습니다.
2. ZIP 전체를 폴더에 압축 해제합니다.
3. `AI Team Office.exe`를 실행합니다. 앱이 기본 브라우저에서 열리고 작업 표시줄 알림 영역에서 다시 열거나 종료할 수 있습니다.

Node.js 22.21.1 런타임과 Windows 실행기가 패키지에 포함되어 있어 별도 Node.js 설치 없이 동작합니다. 로그인, 모델 목록, 팀원 지침을 불러오려면 인터넷 연결이 필요합니다. Windows x64 패키지입니다.

## 작업 결과 파일

새 작업에서 출력 형식을 자동 선택하거나 CSV, HTML, Markdown, JSON, TXT로 지정할 수 있습니다. 생성된 파일은 화면에서 미리 볼 수 있고 다운로드할 수 있으며, 앱 라이브러리에서도 다시 받을 수 있습니다. CSV는 Excel 또는 Google Sheets로 가져올 수 있습니다. 현재 Google Sheets 같은 외부 서비스에 직접 문서를 만드는 커넥터는 연결되어 있지 않으므로, 외부 서비스 요청은 가져오기용 파일로 제공합니다.

결과 파일은 현재 Windows 사용자의 `%APPDATA%\\ai-team-office\\artifacts`에 저장됩니다. ChatGPT 계정 연결 정보는 별도 프로필 파일에 저장됩니다. 앱은 별도의 OpenAI API 키를 요구하지 않으며, 계정별 모델 접근 및 플랜 사용 한도를 따릅니다.

## 팀 분업

공개 `msitarzewski/agency-agents` 저장소의 Markdown 팀원 정의를 불러옵니다. 지휘자가 요청에 맞는 전문가를 최대 3명 배정하고, 전문가 결과를 바탕으로 완성 파일을 만듭니다. 현재 외부 서비스 커넥터가 없는 요청은 가능한 다운로드 파일로 반환하며, 외부 앱에서 작업을 완료했다고 가장하지 않습니다.

## 인터랙티브 미리보기

[AI 팀 오피스 인터랙티브 미리보기](https://ai-team-office.hwahyo.chatgpt.site)에서 화면 이동과 디자인을 확인할 수 있습니다. 웹 미리보기는 레이아웃 확인용이며 AI 실행과 파일 생성에는 Windows 앱이 필요합니다.

개발용으로는 `START-OFFICE.cmd`를 실행하거나 `node office/server.mjs`를 사용할 수 있습니다.
