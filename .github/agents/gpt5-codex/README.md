# GPT-5 Codex Agent

Agent tự động triage và xử lý GitHub issues sử dụng GPT-5 Codex hoặc các mô hình OpenAI khác.

## Tính năng

- **Tự động phân tích issues**: Agent đọc title, body và thông tin tác giả để hiểu vấn đề
- **Gợi ý labels thông minh**: Đề xuất tối đa 3 labels phù hợp từ whitelist được cấu hình
- **Comment hữu ích**: Tự động đăng comment với:
  - Tóm tắt vấn đề
  - Các bước tiếp theo được đề xuất
  - Gợi ý về labels và assignee
- **Tránh duplicate**: Chỉ comment một lần trên mỗi issue (sử dụng comment marker)
- **Retry logic**: Tự động thử lại khi OpenAI API gặp lỗi tạm thời
- **Label whitelist**: Chỉ thêm labels từ danh sách được phê duyệt

## Cấu hình

### 1. Secrets cần thiết

Truy cập Settings → Secrets and variables → Actions trong repository và thêm:

- **OPENAI_API_KEY** (bắt buộc): API key từ OpenAI
  - Lấy tại: https://platform.openai.com/api-keys
  - Cần có quyền truy cập model được chỉ định

### 2. Biến môi trường tùy chọn

Có thể cấu hình thêm trong workflow file (.github/workflows/gpt5-agent.yml):

- **AGENT_MODEL**: Tên model OpenAI sử dụng (mặc định: `gpt-4o-mini`)
  - Ví dụ: `gpt-5-codex`, `gpt-4-turbo`, `gpt-4o`
- **AGENT_MODE**: Chế độ hoạt động
  - `triage-only` (mặc định): Chỉ phân tích và comment
  - `triage-and-pr`: Phân tích + tạo PR skeleton (nếu issue có label `needs-pr`)
- **AGENT_ENABLED**: Bật/tắt agent
  - `true` (mặc định): Agent hoạt động
  - `false`: Vô hiệu hóa agent

### 3. Permissions

Workflow cần các quyền sau trong file `.github/workflows/gpt5-agent.yml`:

```yaml
permissions:
  issues: write      # Để thêm labels và comments
  contents: write    # Để tạo PR (nếu sử dụng AGENT_MODE=triage-and-pr)
```

### 4. Cấu hình labels

Chỉnh sửa file `config.json` để thay đổi:

- **labelWhitelist**: Danh sách labels được phép thêm
- **maxLabels**: Số lượng labels tối đa (mặc định: 3)
- **enableCreatePR**: Bật/tắt tính năng tạo PR tự động (mặc định: false)
- **modelDefault**: Model mặc định nếu AGENT_MODEL không được set

## Cách hoạt động

1. Khi có issue mới (opened) hoặc được chỉnh sửa (edited, reopened, labeled)
2. Workflow được kích hoạt và chạy agent
3. Agent kiểm tra xem đã comment chưa (tránh duplicate)
4. Agent gọi OpenAI API với context của issue
5. OpenAI trả về gợi ý labels và nội dung comment
6. Agent thêm labels (chỉ những labels trong whitelist và tồn tại trong repo)
7. Agent đăng comment với marker đặc biệt

## Cấu trúc file

```
.github/
├── agents/
│   └── gpt5-codex/
│       ├── package.json      # Dependencies
│       ├── run.js            # Script chính
│       ├── config.json       # Cấu hình
│       └── README.md         # File này
└── workflows/
    └── gpt5-agent.yml        # Workflow definition
```

## Development & Testing

### Cài đặt dependencies

```bash
cd .github/agents/gpt5-codex
npm install
```

### Chạy tests

```bash
npm test
```

### Test locally

Tạo file `.env` với nội dung:

```
GITHUB_TOKEN=your_github_token
OPENAI_API_KEY=your_openai_key
AGENT_MODEL=gpt-4o-mini
```

Tạo file test event:

```bash
export GITHUB_EVENT_PATH=/tmp/test-event.json
cat > /tmp/test-event.json << 'EOF'
{
  "issue": {
    "number": 1,
    "title": "Test issue",
    "body": "This is a test",
    "user": {"login": "testuser"}
  },
  "repository": {
    "owner": {"login": "min3rd"},
    "name": "pixart"
  }
}
EOF
```

Chạy agent:

```bash
node run.js
```

## Bảo mật

- ✅ Không commit API keys vào code
- ✅ Labels chỉ được thêm từ whitelist được định nghĩa
- ✅ Agent có thể tắt bất cứ lúc nào bằng AGENT_ENABLED=false
- ✅ Retry với exponential backoff để tránh spam API
- ✅ Comment marker để tránh duplicate comments

## Opt-out

Maintainers có thể vô hiệu hóa agent bằng cách:

1. Set biến môi trường `AGENT_ENABLED=false` trong workflow
2. Xóa hoặc disable workflow file `.github/workflows/gpt5-agent.yml`
3. Xóa secret `OPENAI_API_KEY`

## Troubleshooting

### Agent không chạy

- Kiểm tra secret OPENAI_API_KEY đã được thêm chưa
- Kiểm tra workflow có permissions đúng không
- Xem logs trong Actions tab

### Agent comment nhiều lần

- Kiểm tra commentMarker trong config.json
- Xóa và tạo lại issue để test

### OpenAI API lỗi

- Kiểm tra API key còn hạn sử dụng không
- Kiểm tra model name có đúng không (AGENT_MODEL)
- Xem quota/rate limits tại OpenAI dashboard

## License

MIT - tương tự với repository chính
