---
name: pixart-gpt5-codex-agent
model: gpt5-codex
language: vi
description: |
  Agent hỗ trợ phát triển và thay đổi cho repository "pixart" (một ứng dụng pixel-art/Angular).
  Sử dụng model `gpt5-codex`. Khi thực hiện thay đổi mã nguồn, agent phải tuân thủ chặt chẽ các instruction nội bộ của dự án (xem phần "Project instructions" bên dưới) — những quy tắc này là bắt buộc.

project_instructions: |
  Nội dung sau đây là các quy tắc bắt buộc được trích dẫn từ tệp cấu hình của dự án (copilot-instructions.md). Agent phải tuân thủ mọi lúc khi tạo hoặc sửa mã:

  - TypeScript: dùng strict type checking; tránh `any`; dùng `unknown` khi cần.
  - Angular: ưu tiên thành phần standalone; không đặt `standalone: true` trong decorators (mặc định); dùng signals để quản lý state; lazy-loading cho feature routes.
  - Không dùng `@HostBinding` / `@HostListener` — dùng `host` object trong decorator.
  - Sử dụng `NgOptimizedImage` cho ảnh tĩnh (không dùng base64 inline cho ảnh tối ưu).
  - Components: giữ nhỏ, một trách nhiệm; dùng `input()`/`output()` functions thay vì decorators; dùng `computed()` cho derived state; đặt `changeDetection: ChangeDetectionStrategy.OnPush`.
  - Nghiêm cấm template inline: phải dùng file template ngoại vi (`templateUrl`) và `styleUrls` (không dùng inline `template` hoặc `styles`).
  - Không để bình luận trong mã nguồn (không dùng `//` hoặc `/* */`). Mọi giải thích phải nằm trong tài liệu (README, docs/) hoặc commit message.
  - Dùng Transloco cho mọi text giao diện; không hard-code strings trong template; tất cả UI strings phải là translation keys.
  - Mỗi phần tử HTML thêm vào templates phải có một thuộc tính `id` duy nhất trong document.
  - State management: dùng signals; không dùng `mutate` trên signals; dùng `update` hoặc `set`.
  - Templates: tránh logic phức tạp; dùng native control flow (`@if`, `@for`, `@switch`) theo quy ước dự án.
  - Services: single responsibility; `providedIn: 'root'`; dùng `inject()` thay vì constructor injection.
  - Styling: chỉ dùng Tailwind CSS; không thêm framework styling khác; theme logic phải hỗ trợ light/dark; compact/square UI.

usage: |
  - Mục tiêu: giúp contributor thực hiện các thay đổi mã nguồn, sửa lỗi, thêm tính năng, viết tests và tài liệu cho repository "pixart" theo quy tắc trên.
  - Khi được yêu cầu sửa file: trả về chính xác các thay đổi ở dạng patch (nếu được phép) hoặc hướng dẫn từng bước kèm lệnh để thực hiện. Nếu bạn có quyền sửa trực tiếp (agent làm thay đổi), đảm bảo sử dụng công cụ sửa file phù hợp.
  - Luôn kiểm tra style / lint / build nếu có thể sau thay đổi; nếu không thể chạy build, ghi rõ tại sao.

behavior_constraints: |
  - Luôn tuân thủ project_instructions. Nếu một đề xuất vi phạm bất kỳ quy tắc nào ở trên, sửa đề xuất cho phù hợp và giải thích ngắn gọn tại sao thay đổi cần thiết.
  - Không thêm thư viện mới mà không cập nhật manifest (ví dụ `package.json`) và không thông báo lý do.
  - Không tạo hoặc giữ comments trong mã nguồn; nếu cần giải thích, tạo/ cập nhật tài liệu trong `docs/` hoặc `README.md`.

security_and_privacy: |
  - Không xuất dữ liệu nhạy cảm, không exfiltrate secrets.
  - Khi xử lý tệp cấu hình hoặc environment, luôn báo rõ biến môi trường cần thiết và không in giá trị thực tế của secrets.

notes: |
  - File này được tạo theo yêu cầu branch `5-selection-context-menu-actions`.
  - Nếu cần thay đổi quy tắc project_instructions, update tập trung trong `.github/agents/gpt-5-codex.md` và ghi lại trong `docs/agents.md`.
---

# Quick reference (tóm tắt cho contributors)

- Model: `gpt5-codex`
- Kết luận chính: mọi code change phải tuân thủ những quy tắc TypeScript/Angular/Styling/Localization nêu trên.

--
