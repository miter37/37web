# 네이버 블로그 (SmartEditor ONE) 자동 포스팅 가이드

## 1. 접근 및 라우팅 (Routing)
- **블로그 홈**: `https://section.blog.naver.com`
- **글쓰기 바로가기**: `https://blog.naver.com/GoBlogWrite.naver`
- **실제 에디터 직링크**: `https://blog.naver.com/PostWriteForm.naver?blogId={blogId}`
  - *핵심 팁*: 네이버 블로그 글쓰기 URL(`Redirect=Write`)은 프레임셋 구조로 `mainFrame` 안에 실제 에디터가 들어있습니다. 프레임 제어 복잡도를 없애기 위해 `https://blog.naver.com/PostWriteForm.naver?blogId={blogId}`로 직접 이동하면 최상위 도큐먼트 레벨에서 스마트에디터 DOM을 직접 제어할 수 있어 훨씬 안정적입니다.

## 2. 스마트에디터 ONE 입력 메커니즘 (SmartEditor Automation)
스마트에디터 ONE은 일반적인 `<input>`이나 표준 `<textarea>`가 아니며 화면 밖의 숨겨진 더미 editable div와 캔버스/커스텀 텍스트 렌더링 블록을 사용합니다. 일반 `fill` 명령 대신 CDP의 `Input.dispatchMouseEvent`와 `Input.insertText`를 사용해야 글자 유실 없이 정확하게 입력됩니다.

### 제목 입력:
1. 대상 셀렉터: `.se-documentTitle p`
2. 중앙 좌표를 계산하여 `Input.dispatchMouseEvent` (left click).
3. `Input.insertText`로 제목 텍스트 입력.

### 본문 입력:
1. 대상 셀렉터: `.se-component.se-text p`
2. 시작 좌표로 포커스 클릭 (`Input.dispatchMouseEvent`).
3. 단락별로 `Input.insertText` 호출 후 줄바꿈(엔터 키: `keyCode: 13`) 이벤트 디스패치.

## 3. 임시저장 및 발행 (Save & Publish)
1. **임시저장**:
   - `button.save_btn__FuUyN` (또는 텍스트 `'저장'`을 포함한 버튼) 클릭.
2. **발행 레이어 열기 및 카테고리 변경**:
   - `button.publish_btn__v_kS9` 클릭 -> 카테고리/공개설정 모달 레이어 오픈.
   - 카테고리 드롭다운(`.selectbox_button__IxraO`) 클릭 후, 드롭다운 목록(`li.item__dTdzo`)은 단순 JS `.click()`이 아닌 **CDP `Input.dispatchMouseEvent`로 좌표 직접 클릭**을 해야 정상 선택됨.
3. **최종 발행 확인**:
   - 레이어(`[class*="publish_layer"]` / `.modal_layer`) 내부의 최종 `'발행'` 버튼 클릭.
   - 발행 완료 시 `https://blog.naver.com/PostView.naver?blogId=...&logNo=...`로 자동 리다이렉트됨 (카테고리 번호 `categoryNo` 확인).
