import App from '@/components/App';
import { LangProvider } from '@/lib/i18n';

export default function Page() {
  // 언어 설정은 화면 전체가 공유한다 — 컴포넌트마다 prop 으로 넘기면 빠뜨리는 곳이 생긴다
  return (
    <LangProvider>
      <App />
    </LangProvider>
  );
}
