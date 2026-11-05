# AI Office 최초 연결 검증

별도 OpenAI API 키 없이 공식 Sign in with ChatGPT 경로를 시험하는 독립 검증 도구입니다. 실제 계정의 사용 자격·결제 내역·무료 원격 운영까지 보장하는 프로그램은 아닙니다.

## 실행 (Windows)
1. ZIP을 먼저 모두 압축 해제합니다.
2. Node.js 22 이상이 이미 있다면 START-WINDOWS.cmd를 더블 클릭합니다.
3. 브라우저가 열리지 않으면 실행 창의 http://127.0.0.1 주소를 같은 PC의 브라우저에서 엽니다.
4. 안내를 읽고 Continue with ChatGPT를 누릅니다. OpenAI 공식 auth.openai.com 화면에서 직접 로그인합니다.
5. 권한 화면을 확인합니다. 추가 결제나 원치 않는 크레딧 소비 조건이 보이면 취소합니다.
6. 검사가 끝나면 같은 폴더의 diagnostic.json만 채팅에 첨부합니다.

Node.js가 없으면 https://nodejs.org/en/download 에서 Windows용 공식 ZIP(휴대용 바이너리)을 받아 별도 폴더에 압축 해제할 수 있습니다. 시스템 설치 없이 해당 폴더의 node.exe로 check.mjs를 실행합니다. PowerShell 예시:

```powershell
& 'C:\실제경로\node.exe' 'C:\실제경로\ai-office-check\check.mjs'
```

다운로드 시 CPU에 맞는 x64/ARM64를 선택하세요. 관리자 권한은 필요하지 않습니다. macOS/Linux는 터미널에서 `node check.mjs`를 실행합니다.

## 검사 범위
- 일회성 state, nonce, PKCE를 생성하고 PC의 루프백 주소에서만 결과 수신
- OpenAI 공개 키로 ID 토큰 서명 및 발급자·대상·유효기간·nonce 검증
- 구독 사용 scope 확인
- 계정별 모델 목록 조회 후 짧은 텍스트 응답 1회 요청
- response.completed 수신 여부 확인

이 프로그램은 API 키 환경 변수를 읽지 않고, 별도 유료 API 인증이나 결제·크레딧 구매로 전환하지 않습니다. 단, 서비스 측 구독/크레딧 사용 정책과 실제 청구 내역은 검사할 수 없습니다. 검사 자체는 허용된 사용량을 소모할 수 있습니다.

## 저장·보안·후속 작업
- 토큰, 비밀번호, 이메일, 계정 식별자를 파일이나 콘솔에 남기지 않습니다. 토큰은 프로세스 메모리에서만 사용하며 종료 후 재사용하지 않습니다.
- host.json은 비밀이 아닌 이 PC의 임의 식별자입니다. diagnostic.json은 단계별 성공 여부와 제한된 오류 코드만 포함합니다.
- 로그인 주소·콜백 URL·브라우저 개발자 도구 내용은 공유하지 마세요.
- 10분 안에 로그인하지 않으면 종료합니다. 검사 중 창을 닫으면 diagnostic.json이 생성되지 않을 수 있습니다.
- 이 도구는 연결 검증 전용입니다. 지속 로그인·예약·Discord 연결·원격 서버 설치는 포함하지 않습니다.
- PASS도 무료 원격 운영이나 이미지/영상 제작 지원을 의미하지 않습니다.
- 인증 정보를 저장하지 않으므로 실제 플랫폼 연결 때 다시 로그인해야 합니다. 반복 실행은 새 앱 등록을 만들 수 있으니 불필요하게 반복하지 마세요. 검증용 앱 권한은 ChatGPT 설정에서 해제할 수 있습니다.
- 소스는 공개 검토 가능한 형태로 제공하지만 GitHub 등에 공개 배포된 상태는 아닙니다. 공식 오픈소스 경로의 앱 적격성은 서비스 판단에 따릅니다.

## 개발 검증
`node --test check.test.mjs`

로컬 모의 테스트는 인증 서명·잘못된 상태·미완료 스트림을 검증합니다. 실제 OpenAI 로그인 및 구독 응답은 사용자의 PC에서 확인해야 하며, Windows 실기 테스트도 아직 하지 않았습니다.

## 공식 근거 (2026-10-27 확인)
- https://developers.openai.com/siwc/token-sharing-open-source/sign-in
- https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference
- https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations
- https://developers.openai.com/siwc/website

## 수정판 1.0.1
로그인 시작 시 Origin 누락과 충돌할 수 있는 Referrer-Policy를 same-origin으로 변경하고 공식 인증 리디렉션을 CSP에 허용했습니다. /start 직접 열기와 중복 클릭에 복구·안내를 추가했습니다. HTTP 경로 테스트와 단위 테스트 13개 통과. 이 환경에는 Chromium 실행 파일이 없어 실제 브라우저 클릭 테스트는 수행하지 못했습니다.
