# Vercel 배포

- Vercel 프로젝트는 `main` 브랜치의 `platform/web`을 Next.js 앱으로 배포합니다.
- 환경 변수는 Vercel 프로젝트 설정에서 관리합니다. 공개 Firebase/Supabase 설정은 `NEXT_PUBLIC_` 변수로, `SUPABASE_SERVICE_ROLE_KEY`는 서버 전용 Secret으로 등록합니다.
- 비밀 키를 소스 코드나 저장소에 커밋하지 마세요.
- `main`에 커밋을 푸시하면 프로덕션 배포가 시작됩니다. 환경 변수를 바꾼 뒤에는 새 배포가 필요합니다.
- 현재는 개인용 Vercel Hobby 운영을 기준으로 합니다. 회사 업무에 사용하기 전에는 Vercel Pro로 전환합니다.
