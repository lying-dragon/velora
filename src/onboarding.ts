import { readPreferences, savePreferences } from "./persistence";
export function guideHtml() {
  return `<div class="welcome-guide"><span class="eyebrow orange">WELCOME TO VELORA</span><h2>페달을 밟으면, 나만의 길이 시작됩니다.</h2><p>스마트로라의 파워로 달리는 3D 라이딩 · 처음에는 장비 없이 데모로 둘러보세요.</p><ol><li><b>내 몸에 맞추기</b><span>라이더 설정에서 체중과 FTP를 입력합니다. 설정과 만든 훈련은 자동 저장됩니다.</span></li><li><b>장치 연결하기</b><span>ANT+ USB 동글 또는 Bluetooth 로라를 연결합니다. 심박계는 Bluetooth로 별도 연결할 수 있습니다.</span></li><li><b>코스와 훈련 선택하기</b><span>자유 주행은 경사에 맞춘 SIM, 훈련은 목표 파워를 따르는 ERG. Z2·인터벌·램프 테스트와 직접 만든 훈련을 선택하세요.</span></li><li><b>라이딩 끝내고 공유하기</b><span>종료하면 기록·문구·이미지가 생성됩니다. 데스크톱 앱의 Strava 창에서 웹 화면 자동 입력을 사용할 수 있습니다.</span></li></ol><details><summary>휴대폰·태블릿에서도 사용할 수 있나요?</summary><table><tr><th>Mac 앱 / Windows 웹</th><td>Mac 설치형 앱을 제공합니다. Windows는 Chrome/Edge 웹 버전으로 연결하며 설치형 빌드는 별도 제작이 필요합니다.</td></tr><tr><th>Android / 태블릿</th><td>HTTPS 웹 버전의 Chrome에서 데모·훈련과 지원 장비의 Bluetooth 연결 가능. ANT+ USB는 장비별 확인이 필요합니다.</td></tr><tr><th>iPhone / iPad</th><td>데모·훈련 편집·기록 카드 이용 가능. 현재 웹 버전의 Bluetooth / ANT+ 직접 연결은 지원하지 않습니다.</td></tr></table><p>휴대폰에서 PC의 127.0.0.1 주소를 열 수는 없습니다. 공유용 HTTPS 사이트가 필요하며, 모바일에서는 데스크톱 Strava 자동화가 실행되지 않습니다.</p></details><div class="welcome-actions"><label><input id="remember-guide" type="checkbox" checked/> 다음 실행부터 이 안내 숨기기</label><button id="welcome-start" class="primary">라이딩 둘러보기 →</button></div><small>언제든 라이더 설정에서 ‘사용 가이드 다시 보기’를 열 수 있습니다.</small></div>`;
}
export function bindGuide(host: HTMLElement, close: () => void) {
  host.querySelector<HTMLElement>("#welcome-start")!.onclick = () => {
    savePreferences({
      onboardingDone:
        host.querySelector<HTMLInputElement>("#remember-guide")!.checked,
    });
    close();
  };
}
export function needsGuide() {
  return !readPreferences().onboardingDone;
}
